# Cycles MCP Server — Quickstart

## Prerequisites

- Node.js 20+
- A Cycles API key (get one at https://runcycles.com)

## Installation

```bash
npm install @runcycles/mcp-server
```

## Configuration

Set your environment variables:

```bash
export CYCLES_API_KEY=your-api-key-here
export CYCLES_BASE_URL=https://api.runcycles.com  # optional
```

For local development with mock responses:

```bash
export CYCLES_MOCK=true
```

## Running

### stdio transport (for Claude Desktop / Claude Code)

```bash
npx @runcycles/mcp-server
```

### HTTP transport (for web integrations)

```bash
npx @runcycles/mcp-server --transport http
# Server starts on http://localhost:3000
# Health check: GET /health
# MCP endpoint: POST /mcp
```

## Your First Budget Check

Once connected, use the `cycles_check_balance` tool:

```json
{
  "tenant": "your-tenant-id"
}
```

Then reserve budget before a costly operation:

```json
{
  "idempotencyKey": "unique-uuid-here",
  "subject": { "tenant": "your-tenant-id", "workflow": "summarize" },
  "action": { "kind": "llm.completion", "name": "openai:gpt-4o" },
  "estimate": { "unit": "TOKENS", "amount": 2000 }
}
```

## Next Steps

- Read [Integration Patterns](cycles://docs/patterns) for the full reserve/commit/release lifecycle
- Use the `design_budget_strategy` prompt to plan your scope hierarchy
