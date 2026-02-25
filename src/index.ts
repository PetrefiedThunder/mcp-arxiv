#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const USER_AGENT = "mcp-arxiv/1.0.0 (https://github.com/PetrefiedThunder/mcp-arxiv)";
const BASE_URL = "https://export.arxiv.org/api/query";
const RATE_LIMIT_MS = 3000; // arXiv requires 1 request per 3 seconds

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`arXiv API error: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// Lightweight XML helpers — no external deps
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

function extractEntries(xml: string): string[] {
  const re = /<entry>([\s\S]*?)<\/entry>/gi;
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

interface Paper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  absUrl: string;
  doi: string;
  comment: string;
  journalRef: string;
}

function parseEntry(entry: string): Paper {
  const id = extractTag(entry, "id");
  const arxivId = id.replace("http://arxiv.org/abs/", "").replace(/v\d+$/, "");

  // Extract authors
  const authorBlocks = entry.match(/<author>([\s\S]*?)<\/author>/gi) || [];
  const authors = authorBlocks.map((a) => extractTag(a, "name"));

  // Extract categories
  const catMatches = entry.match(/<category[^>]*term="([^"]*)"/gi) || [];
  const categories = catMatches.map((c) => {
    const m = c.match(/term="([^"]*)"/);
    return m ? m[1] : "";
  }).filter(Boolean);

  // Extract PDF link
  const linkMatches = entry.match(/<link[^>]*\/>/gi) || [];
  let pdfUrl = "";
  for (const link of linkMatches) {
    if (link.includes('title="pdf"')) {
      const m = link.match(/href="([^"]*)"/);
      if (m) pdfUrl = m[1];
    }
  }
  if (!pdfUrl) pdfUrl = `https://arxiv.org/pdf/${arxivId}`;

  return {
    id: arxivId,
    title: extractTag(entry, "title").replace(/\s+/g, " "),
    summary: extractTag(entry, "summary").replace(/\s+/g, " "),
    authors,
    published: extractTag(entry, "published"),
    updated: extractTag(entry, "updated"),
    categories,
    pdfUrl,
    absUrl: `https://arxiv.org/abs/${arxivId}`,
    doi: extractTag(entry, "arxiv:doi"),
    comment: extractTag(entry, "arxiv:comment"),
    journalRef: extractTag(entry, "arxiv:journal_ref"),
  };
}

function parseFeed(xml: string): { totalResults: number; papers: Paper[] } {
  const totalStr = extractTag(xml, "opensearch:totalResults");
  const totalResults = parseInt(totalStr, 10) || 0;
  const entries = extractEntries(xml);
  const papers = entries.map(parseEntry);
  return { totalResults, papers };
}

// MCP Server
const server = new McpServer({
  name: "mcp-arxiv",
  version: "1.0.0",
});

server.tool(
  "search_papers",
  "Search arXiv for academic papers by query. Supports arXiv query syntax (ti:, au:, abs:, cat:, etc.)",
  {
    query: z.string().describe("Search query. Examples: 'transformer attention', 'au:hinton', 'ti:neural AND cat:cs.AI'"),
    category: z.string().optional().describe("Filter by arXiv category (e.g. cs.AI, math.CO, physics.hep-th)"),
    maxResults: z.number().min(1).max(100).default(10).describe("Max results to return (1-100)"),
    sortBy: z.enum(["relevance", "lastUpdatedDate", "submittedDate"]).default("relevance"),
    start: z.number().min(0).default(0).describe("Offset for pagination"),
  },
  async ({ query, category, maxResults, sortBy, start }) => {
    let searchQuery = query;
    if (category) {
      searchQuery = `${searchQuery} AND cat:${category}`;
    }

    const params = new URLSearchParams({
      search_query: searchQuery,
      start: String(start),
      max_results: String(maxResults),
      sortBy,
      sortOrder: "descending",
    });

    const xml = await rateLimitedFetch(`${BASE_URL}?${params}`);
    const { totalResults, papers } = parseFeed(xml);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ totalResults, count: papers.length, start, papers }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_paper",
  "Get detailed metadata for a specific arXiv paper by its ID",
  {
    arxivId: z.string().describe("arXiv paper ID (e.g. '2301.07041' or '2301.07041v2')"),
  },
  async ({ arxivId }) => {
    const cleanId = arxivId.replace("arxiv:", "").replace("arXiv:", "");
    const xml = await rateLimitedFetch(`${BASE_URL}?id_list=${cleanId}`);
    const { papers } = parseFeed(xml);

    if (papers.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No paper found with ID: ${arxivId}` }],
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(papers[0], null, 2) }],
    };
  }
);

server.tool(
  "get_pdf_url",
  "Get the direct PDF download URL for an arXiv paper",
  {
    arxivId: z.string().describe("arXiv paper ID (e.g. '2301.07041')"),
  },
  async ({ arxivId }) => {
    const cleanId = arxivId.replace("arxiv:", "").replace("arXiv:", "");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            arxivId: cleanId,
            pdfUrl: `https://arxiv.org/pdf/${cleanId}`,
            absUrl: `https://arxiv.org/abs/${cleanId}`,
          }),
        },
      ],
    };
  }
);

server.tool(
  "list_categories",
  "List arXiv subject categories and their descriptions",
  {
    group: z.string().optional().describe("Filter by group prefix (e.g. 'cs', 'math', 'physics', 'q-bio', 'q-fin', 'stat', 'eess', 'econ')"),
  },
  async ({ group }) => {
    const categories: Record<string, string> = {
      "cs.AI": "Artificial Intelligence",
      "cs.CL": "Computation and Language (NLP)",
      "cs.CV": "Computer Vision and Pattern Recognition",
      "cs.CR": "Cryptography and Security",
      "cs.DB": "Databases",
      "cs.DC": "Distributed, Parallel, and Cluster Computing",
      "cs.DS": "Data Structures and Algorithms",
      "cs.HC": "Human-Computer Interaction",
      "cs.IR": "Information Retrieval",
      "cs.IT": "Information Theory",
      "cs.LG": "Machine Learning",
      "cs.MA": "Multiagent Systems",
      "cs.NE": "Neural and Evolutionary Computing",
      "cs.NI": "Networking and Internet Architecture",
      "cs.OS": "Operating Systems",
      "cs.PL": "Programming Languages",
      "cs.RO": "Robotics",
      "cs.SE": "Software Engineering",
      "cs.SI": "Social and Information Networks",
      "math.AG": "Algebraic Geometry",
      "math.CO": "Combinatorics",
      "math.NA": "Numerical Analysis",
      "math.OC": "Optimization and Control",
      "math.PR": "Probability",
      "math.ST": "Statistics Theory",
      "physics.hep-th": "High Energy Physics - Theory",
      "physics.hep-ph": "High Energy Physics - Phenomenology",
      "physics.cond-mat": "Condensed Matter",
      "physics.quant-ph": "Quantum Physics",
      "q-bio.BM": "Biomolecules",
      "q-bio.GN": "Genomics",
      "q-bio.NC": "Neurons and Cognition",
      "q-fin.CP": "Computational Finance",
      "q-fin.PM": "Portfolio Management",
      "q-fin.RM": "Risk Management",
      "q-fin.ST": "Statistical Finance",
      "stat.ML": "Machine Learning (Statistics)",
      "stat.ME": "Methodology",
      "stat.AP": "Applications",
      "eess.AS": "Audio and Speech Processing",
      "eess.IV": "Image and Video Processing",
      "eess.SP": "Signal Processing",
      "econ.EM": "Econometrics",
      "econ.GN": "General Economics",
    };

    let filtered = categories;
    if (group) {
      filtered = Object.fromEntries(
        Object.entries(categories).filter(([k]) =>
          k.toLowerCase().startsWith(group.toLowerCase())
        )
      );
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(filtered, null, 2) }],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
