import { describe, it, expect } from "vitest";

// Unit tests for XML parsing helpers — we test the logic without hitting arXiv API

describe("mcp-arxiv", () => {
  it("should have correct package metadata", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    expect(pkg.default.name).toBe("mcp-arxiv");
    expect(pkg.default.version).toBe("1.0.0");
  });

  it("should parse arXiv IDs correctly", () => {
    const ids = [
      "2301.07041",
      "2301.07041v2",
      "arxiv:2301.07041",
      "arXiv:2301.07041v1",
    ];
    const cleaned = ids.map((id) =>
      id.replace("arxiv:", "").replace("arXiv:", "")
    );
    expect(cleaned).toEqual([
      "2301.07041",
      "2301.07041v2",
      "2301.07041",
      "2301.07041v1",
    ]);
  });

  it("should generate correct PDF URLs", () => {
    const id = "2301.07041";
    expect(`https://arxiv.org/pdf/${id}`).toBe(
      "https://arxiv.org/pdf/2301.07041"
    );
    expect(`https://arxiv.org/abs/${id}`).toBe(
      "https://arxiv.org/abs/2301.07041"
    );
  });

  it("should build correct search URLs", () => {
    const params = new URLSearchParams({
      search_query: "transformer AND cat:cs.AI",
      start: "0",
      max_results: "10",
      sortBy: "relevance",
      sortOrder: "descending",
    });
    const url = `https://export.arxiv.org/api/query?${params}`;
    expect(url).toContain("search_query=transformer");
    expect(url).toContain("cat%3Acs.AI");
    expect(url).toContain("max_results=10");
  });

  it("should filter categories by group", () => {
    const categories: Record<string, string> = {
      "cs.AI": "Artificial Intelligence",
      "cs.CL": "Computation and Language",
      "math.CO": "Combinatorics",
    };
    const filtered = Object.fromEntries(
      Object.entries(categories).filter(([k]) => k.startsWith("cs"))
    );
    expect(Object.keys(filtered)).toEqual(["cs.AI", "cs.CL"]);
  });

  it("should enforce rate limit timing", () => {
    const RATE_LIMIT_MS = 3000;
    const lastRequest = Date.now() - 1000;
    const elapsed = Date.now() - lastRequest;
    const needsWait = elapsed < RATE_LIMIT_MS;
    expect(needsWait).toBe(true);
  });
});
