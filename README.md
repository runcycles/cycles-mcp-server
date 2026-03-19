[![npm](https://img.shields.io/npm/v/@runcycles/mcp-server)](https://www.npmjs.com/package/@runcycles/mcp-server)
[![CI](https://github.com/runcycles/cycles-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/runcycles/cycles-mcp-server/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-green)](https://modelcontextprotocol.io)

# Cycles MCP Server

MCP server for [Cycles](https://runcycles.com) — runtime budget authority for autonomous agents.

## Why use this?

Autonomous AI agents (Claude, GPT, custom agents) call LLMs, invoke tools, and hit external APIs — but have no built-in way to cap how much they spend. A single agent loop can burn through hundreds of dollars before anyone notices. Multiply that across tenants and teams, and cost control becomes a real problem.

This MCP server gives any MCP-compatible agent a **runtime budget authority**: a set of tools to check, reserve, spend, and release budget before and after every costly operation. The agent asks "can I afford this?" before acting, and reports what it actually used afterward.

**Who needs this:**

- **Platform teams** building multi-tenant agent systems that need per-customer or per-workspace spend limits
- **Agent developers** who want agents to self-regulate — degrade to cheaper models when budget is low, skip optional tool calls, reduce retries
- **Enterprises** deploying AI agents that need guardrails so a runaway agent can't blow through a budget

**Why MCP specifically:**

MCP is the standard protocol that AI hosts (Claude Desktop, Claude Code, Cursor, Windsurf, custom agents) use to discover and call tools. By exposing Cycles as an MCP server, any MCP-compatible agent gets budget awareness as a plug-in — just add the server to your config. No SDK integration in the agent's own code required.

The server also ships built-in [prompts](#prompts) so an AI assistant can help you design your budget strategy, generate integration code, and diagnose budget overruns — not just enforce budgets at runtime.

## Use Cases

### Coding agent with a per-task dollar cap

You run a Claude Code agent that writes and iterates on code. Each task should cost no more than $5. The agent calls `cycles_reserve` before every LLM call with a cost estimate in `USD_MICROCENTS`. If the reservation comes back `DENY`, the agent stops and reports "budget exhausted" instead of silently racking up charges. When the call completes, `cycles_commit` records the actual token cost so the running total stays accurate.

### Multi-tenant SaaS with per-customer budgets

Your platform lets customers deploy AI assistants. Each customer has a monthly budget. The agent calls `cycles_check_balance` at the start of a conversation to see what's left, then `cycles_reserve` before each tool invocation (web search, code execution, API calls). If customer Acme is near their limit, the decision comes back `ALLOW_WITH_CAPS` — the agent automatically drops to a cheaper model and skips optional tools. Customer budgets are isolated; one customer's heavy usage never affects another.

### Multi-agent pipeline with shared budget

You have an orchestrator that fans out to specialist agents — a researcher, a coder, and a reviewer. All three draw from the same workflow budget. Each agent calls `cycles_reserve` before its work; the Cycles server tracks concurrent reservations so the total never exceeds the workflow limit. If the researcher burns through 80% of the budget, the coder's next reservation gets `DENY` and the orchestrator can decide to skip the review step instead of going over budget.

### Long-running data pipeline with heartbeats

An agent processes a large dataset in chunks, each chunk taking several minutes. It calls `cycles_reserve` with a 5-minute TTL before each chunk, then `cycles_extend` every 60 seconds to keep the reservation alive while processing. If the agent crashes, the reservation expires automatically and the locked budget returns to the pool — no manual cleanup needed.

### Fire-and-forget usage metering

You have an existing system that already makes LLM calls and you just want to track spend, not gate it. After each call completes, the agent fires `cycles_create_event` with the actual cost. No reservation needed — the event is applied atomically to all budget scopes (tenant, workspace, app). You get a real-time spend dashboard without changing your existing call flow.

## Installation

```bash
npm install @runcycles/mcp-server
```

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cycles": {
      "command": "npx",
      "args": ["-y", "@runcycles/mcp-server"],
      "env": {
        "CYCLES_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

For local development without an API key, use mock mode:

```json
{
  "mcpServers": {
    "cycles": {
      "command": "npx",
      "args": ["-y", "@runcycles/mcp-server"],
      "env": {
        "CYCLES_MOCK": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add cycles -- npx -y @runcycles/mcp-server
```

Set your API key:

```bash
export CYCLES_API_KEY=your-api-key-here
```

### Cursor / Windsurf / Other MCP Hosts

Use stdio transport with:

```
command: npx
args: ["-y", "@runcycles/mcp-server"]
env: { CYCLES_API_KEY: "your-key" }
```

## Configuration

```bash
export CYCLES_API_KEY=your-api-key-here       # required (unless CYCLES_MOCK=true)
export CYCLES_BASE_URL=https://api.runcycles.com  # optional
export CYCLES_MOCK=true                        # optional, enables mock mode
export PORT=3000                               # optional, for HTTP transport
```

**Need an API key?** API keys are created via the Cycles Admin Server (port 7979). See the [deployment guide](https://runcycles.com/quickstart/deploying-the-full-cycles-stack#step-3-create-an-api-key) to create one, or run:

```bash
curl -s -X POST http://localhost:7979/v1/admin/api-keys \
  -H "Content-Type: application/json" \
  -H "X-Admin-API-Key: admin-bootstrap-key" \
  -d '{"tenant_id":"acme-corp","name":"dev-key","permissions":["reservations:create","reservations:commit","reservations:release","reservations:extend","reservations:list","balances:read","decide","events:create"]}' | jq -r '.key_secret'
```

The key (e.g. `cyc_live_abc123...`) is shown only once — save it immediately. For key rotation and lifecycle details, see [API Key Management](https://runcycles.com/how-to/api-key-management-in-cycles).

## Running

```bash
# stdio transport (default — for Claude Desktop / Claude Code)
npx @runcycles/mcp-server

# HTTP transport (Streamable HTTP on port 3000)
npx @runcycles/mcp-server --transport http
```

## Tools

| Tool | Protocol Endpoint | Description |
|------|-------------------|-------------|
| `cycles_reserve` | `POST /v1/reservations` | Reserve budget before a costly operation |
| `cycles_commit` | `POST /v1/reservations/{id}/commit` | Commit actual usage after operation completes |
| `cycles_release` | `POST /v1/reservations/{id}/release` | Release reservation without committing |
| `cycles_extend` | `POST /v1/reservations/{id}/extend` | Extend reservation TTL (heartbeat) |
| `cycles_decide` | `POST /v1/decide` | Lightweight preflight budget check |
| `cycles_check_balance` | `GET /v1/balances` | Check current budget balance for a scope |
| `cycles_list_reservations` | `GET /v1/reservations` | List reservations with filters |
| `cycles_get_reservation` | `GET /v1/reservations/{id}` | Get reservation details by ID |
| `cycles_create_event` | `POST /v1/events` | Record usage without reserve/commit lifecycle |

## Agent Decision Loop

Every costly operation follows a reserve → execute → finalize lifecycle:

```
1. cycles_reserve   → Lock budget before each costly step
2. Execute          → Perform the operation (respecting any caps)
3. cycles_commit    → Record actual usage — releases unused portion back to the pool
   OR cycles_release → Cancel the reservation if the step was skipped
```

Optionally, before reserving:
- `cycles_check_balance` — inspect remaining budget to plan your approach
- `cycles_decide` — lightweight preflight check without locking funds

Every reservation **must** be finalized with either `cycles_commit` or `cycles_release` — never leave reservations dangling. For long-running operations, use `cycles_extend` to heartbeat the reservation TTL so it doesn't expire mid-operation. See [integration patterns](docs/patterns.md) for detailed examples.

## Resources

| URI | Description |
|-----|-------------|
| `cycles://balances/{tenant}` | Current budget balance for a tenant |
| `cycles://reservations/{reservation_id}` | Reservation details |
| `cycles://docs/quickstart` | Getting started guide |
| `cycles://docs/patterns` | Integration patterns |

## Prompts

| Prompt | Description |
|--------|-------------|
| `integrate_cycles` | Generate Cycles integration code |
| `diagnose_overrun` | Analyze budget exhaustion |
| `design_budget_strategy` | Recommend scope hierarchy and limits |

## Development

```bash
npm install
npm run dev              # stdio transport with tsx
npm run dev:http         # HTTP transport with tsx
npm run build            # TypeScript build
npm run lint             # ESLint
npm test                 # Run tests
npm run test:coverage    # Run with coverage (95%+ lines, 85%+ branches)
npm run typecheck        # Type check without emitting
```

## Publishing

The server is published to two registries:

| Registry | Identifier | How |
|----------|-----------|-----|
| **npm** | `@runcycles/mcp-server` | CI publishes on `v*` tag push with provenance |
| **MCP Registry** | `io.github.runcycles/cycles-mcp-server` | CI publishes `.mcp/server.json` manifest after npm |

To release a new version:

```bash
# 1. Update version in package.json and .mcp/server.json
# 2. Commit, tag, and push
git tag v0.1.0
git push origin v0.1.0
```

CI runs: test (Node 20+22) → npm publish → MCP Registry publish.

## Protocol Conformance

This MCP server is audited against the Cycles Protocol v0.1.23 OpenAPI spec. See [AUDIT.md](AUDIT.md) for the full conformance report.

## License

Apache-2.0
