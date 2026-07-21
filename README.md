[![npm](https://img.shields.io/npm/v/@runcycles/mcp-server)](https://www.npmjs.com/package/@runcycles/mcp-server)
[![npm Downloads](https://img.shields.io/npm/dm/@runcycles/mcp-server)](https://www.npmjs.com/package/@runcycles/mcp-server)
[![CI](https://github.com/runcycles/cycles-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/runcycles/cycles-mcp-server/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-green)](https://modelcontextprotocol.io)
[![Coverage](https://img.shields.io/badge/coverage-97%25-brightgreen)](https://github.com/runcycles/cycles-mcp-server/actions)
[![SafeSkill 97/100](https://img.shields.io/badge/SafeSkill-97%2F100_Verified%20Safe-brightgreen)](https://safeskill.dev/scan/runcycles-cycles-mcp-server)

# Cycles MCP Server — AI agent runtime control over Model Context Protocol

**MCP server that gives any MCP-compatible AI agent (Claude Code, Cursor, Windsurf, custom agents) runtime budget, action, and audit authority — enforce LLM cost limits, tool call caps, action permissions, and audit trails before execution, with zero agent code changes.** Connect via MCP and use the budget tools (`cycles_reserve`, `cycles_commit`, `cycles_release`, `cycles_decide`) directly from the agent's tool-calling loop. Powered by [Cycles](https://runcycles.io). See [Security Model & Enforcement Boundary](#security-model--enforcement-boundary) for what is enforced server-side versus cooperatively in the agent loop.

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

**One-click (recommended):** download `cycles-mcp-server-<version>.mcpb` from the [latest release](https://github.com/runcycles/cycles-mcp-server/releases/latest) and open it with Claude Desktop (double-click, or Settings → Extensions → drag it in). Claude Desktop shows a config screen for your Cycles server URL and API key — or enable mock mode to explore the tools without a server (no enforcement).

**Manual (JSON config):** add to your `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cycles": {
      "command": "npx",
      "args": ["-y", "@runcycles/mcp-server"],
      "env": {
        "CYCLES_BASE_URL": "http://localhost:7878",
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

Set your environment variables:

```bash
export CYCLES_BASE_URL=http://localhost:7878
export CYCLES_API_KEY=your-api-key-here
```

### Cursor / Windsurf / Other MCP Hosts

Use stdio transport with:

```
command: npx
args: ["-y", "@runcycles/mcp-server"]
env: { CYCLES_API_KEY: "your-key", CYCLES_BASE_URL: "http://localhost:7878" }
```

## Configuration

```bash
export CYCLES_API_KEY=your-api-key-here       # required (unless CYCLES_MOCK=true)
export CYCLES_BASE_URL=http://localhost:7878   # required — your Cycles server URL
export CYCLES_MOCK=false                       # true disables live enforcement and returns synthetic responses
export CYCLES_ALLOW_MOCK_IN_PRODUCTION=false  # must be true to use mock mode with NODE_ENV=production
export PORT=3000                               # optional, for HTTP transport
export HOST=127.0.0.1                          # optional HTTP bind address; unset binds all interfaces
export MCP_HTTP_AUTH_TOKEN=replace-me          # optional bearer token required on /mcp when set
```

Mock mode prints a prominent warning on every startup, and generated mock reservation/event IDs begin with `mock_`. The server refuses to start with `CYCLES_MOCK=true` and `NODE_ENV=production` unless `CYCLES_ALLOW_MOCK_IN_PRODUCTION=true` is also set.

For HTTP transport, set `MCP_HTTP_AUTH_TOKEN` to require `Authorization: Bearer <token>` on every `/mcp` request. Blank or whitespace-only configured tokens are rejected at startup. `/health` remains public. If no token is configured while HTTP binds to a non-loopback address, the server prints a prominent warning.

**Need an API key?** API keys are created via the Cycles Admin Server (port 7979). See the [deployment guide](https://runcycles.io/quickstart/deploying-the-full-cycles-stack#step-3-create-an-api-key) to create one, or run:

```bash
curl -s -X POST http://localhost:7979/v1/admin/api-keys \
  -H "Content-Type: application/json" \
  -H "X-Admin-API-Key: admin-bootstrap-key" \
  -d '{"tenant_id":"acme-corp","name":"dev-key","permissions":["reservations:create","reservations:commit","reservations:release","reservations:extend","reservations:list","balances:read","decide","events:create"]}' | jq -r '.key_secret'
```

The key (e.g. `cyc_live_abc123...`) is shown only once — save it immediately. For key rotation and lifecycle details, see [API Key Management](https://runcycles.io/how-to/api-key-management-in-cycles).

> **Individual vs. team use:** For individual use or evaluation, set `CYCLES_MOCK=true` — no server or API key required. If you're deploying agents for multiple users or workspaces, see the [multi-tenant setup guide](https://runcycles.io/how-to/understanding-tenants-scopes-and-budgets-in-cycles).

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

## Security Model & Enforcement Boundary

Cycles authority is enforced at two different boundaries, and it matters which one you are relying on.

### Enforced unconditionally (server-side)

Every `cycles_reserve`, `cycles_commit`, and `cycles_decide` call is a *request for authority*, evaluated by the Cycles runtime against the authenticated tenant's policies and current balances. This holds regardless of what the model generates:

- **Malformed amounts never leave the MCP server.** Input schemas reject negative, fractional, or non-numeric amounts, and any value above JavaScript's safe-integer range (2⁵³ − 1), before a request is made.
- **A well-formed but excessive reservation is refused by the Cycles server** with a `BUDGET_EXCEEDED` error — no reservation ID is issued and nothing is spent. A hallucinated or prompt-injected oversized reserve cannot make Cycles grant more authority than policy allows.
- **A reservation by itself spends nothing.** Budget only moves on `cycles_commit` (or `cycles_create_event`), and commits are bounded by the reservation plus the configured overage policy.

### Cooperative (inside the agent's tool loop)

This MCP server exposes budget tools *alongside* the host's other tools — it does not sit between the model and those tools. When a reservation is denied, the agent is instructed not to proceed, but nothing in the MCP protocol forces it to. A prompt-injected or misbehaving agent could skip `cycles_reserve` entirely and invoke a consequential tool directly.

### Making enforcement non-bypassable

For the budget check to be a hard gate rather than a convention, put Cycles in the actual dispatch path so the downstream operation cannot execute without a valid reservation:

- **Gate in the host application** — before executing a consequential operation, require a reservation ID and verify it with `cycles_get_reservation`.
- **Use a dispatch-path integration** — framework middleware that wraps tool execution (e.g. the Cycles Spring Boot starter or LangChain integration) enforces reserve-before-execute in code the model cannot skip.
- **Meter server-side as a backstop** — where gating isn't possible, record actual usage with `cycles_create_event` so overruns are at least detected and budgets stay accurate.

### Mock mode enforces nothing

With `CYCLES_MOCK=true`, every call returns a synthetic `ALLOW` — it exists for development and demos only. The server refuses to start in mock mode when `NODE_ENV=production` (unless explicitly overridden) precisely so a synthetic `ALLOW` is never mistaken for a real one.

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
| **MCP Registry** | `io.github.runcycles/cycles-mcp-server` | CI publishes the `server.json` manifest after npm |

To release a new version:

```bash
# 1. Update version in package.json and server.json
# 2. Commit, tag, and push
git tag v0.1.0
git push origin v0.1.0
```

CI runs: test (Node 20+22) → npm publish → MCP Registry publish.

## Documentation

- [Cycles Documentation](https://runcycles.io) — full docs site
- [MCP Server Quickstart](https://runcycles.io/quickstart/getting-started-with-the-mcp-server) — getting started guide
- [Integrating Cycles with MCP](https://runcycles.io/how-to/integrating-cycles-with-mcp) — detailed MCP integration guide

## Protocol Conformance

This MCP server is audited against the Cycles Protocol v0.1.24 OpenAPI spec. See [AUDIT.md](AUDIT.md) for the full conformance report.

## Privacy Policy

Full policy: **[runcycles.io/privacy](https://runcycles.io/privacy)**

The short version: this server connects only to the Cycles server URL you configure and sends it budget requests (subject identifiers, amounts, usage metrics) — Cycles is self-hosted, so that data stays in your infrastructure and never reaches runcycles. No LLM prompts or responses are stored. The server contains no telemetry, phone-home, or update checks. In mock mode, no network requests are made at all. Your API key lives in your local configuration and is sent only to your configured Cycles server.

## License

Apache-2.0
