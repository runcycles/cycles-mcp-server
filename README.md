# Cycles MCP Server

MCP server for [Cycles](https://runcycles.com) — runtime budget authority for autonomous agents.

## Installation

```bash
npm install @runcycles/mcp-server
```

## Configuration

```bash
export CYCLES_API_KEY=your-api-key-here       # required
export CYCLES_BASE_URL=https://api.runcycles.com  # optional
export CYCLES_MOCK=true                        # optional, enables mock mode
export PORT=3000                               # optional, for HTTP transport
```

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

```
1. cycles_check_balance  → Is there enough budget to start?
2. cycles_reserve        → Claim budget before each step
3. Execute               → Perform the operation (respect any caps)
4. cycles_commit         → Reconcile actual usage after each step
5. cycles_release        → Clean release if step was skipped/cancelled
```

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
npm test                 # Run tests
npm run test:coverage    # Run with coverage (95%+ lines, 85%+ branches)
npm run typecheck        # Type check without emitting
```

## Protocol Conformance

This MCP server is audited against the Cycles Protocol v0.1.23 OpenAPI spec. See [AUDIT.md](AUDIT.md) for the full conformance report.

## License

Apache-2.0
