# mcp-arxiv

Search and retrieve academic preprints from arXiv across physics, CS, math, and more.

> **Free API** — No API key required.

## Tools

| Tool | Description |
|------|-------------|
| `search_papers` | Search arXiv for academic papers by query. Supports arXiv query syntax (ti:, au:, abs:, cat:, etc.) |
| `get_paper` | Get detailed metadata for a specific arXiv paper by its ID |
| `get_pdf_url` | Get the direct PDF download URL for an arXiv paper |
| `list_categories` | List arXiv subject categories and their descriptions |

## Installation

```bash
git clone https://github.com/PetrefiedThunder/mcp-arxiv.git
cd mcp-arxiv
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

## Usage with npx

```bash
npx mcp-arxiv
```

## License

MIT
