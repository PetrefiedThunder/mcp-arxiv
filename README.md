# mcp-arxiv

MCP server for searching and retrieving academic papers from [arXiv](https://arxiv.org). No API key required.

## Tools

| Tool | Description |
|------|-------------|
| `search_papers` | Search arXiv by query, category, with sorting and pagination |
| `get_paper` | Get detailed metadata for a paper by arXiv ID |
| `get_pdf_url` | Get direct PDF download URL for a paper |
| `list_categories` | List arXiv subject categories |

## Install

```bash
npm install
npm run build
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arxiv": {
      "command": "node",
      "args": ["/path/to/mcp-arxiv/dist/index.js"]
    }
  }
}
```

## Query Syntax

arXiv supports structured queries:
- `ti:transformer` — search titles
- `au:hinton` — search authors
- `abs:attention mechanism` — search abstracts
- `cat:cs.AI` — filter by category
- Combine with `AND`, `OR`, `ANDNOT`

Example: `ti:transformer AND cat:cs.CL`

## Rate Limits

arXiv requires max 1 request per 3 seconds. This is enforced automatically.

## License

MIT
