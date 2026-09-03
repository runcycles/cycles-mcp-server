# Grok Bot paid-media gateway

This runnable example exposes one consequential MCP tool,
`apply_campaign_daily_budget`, for Grok Bot. The tool cannot reach the paid-media
API until a live Cycles `RISK_POINTS` reservation succeeds.

It demonstrates the hard-enforcement pattern that a standalone Cycles MCP
server cannot provide by itself:

```text
Grok Bot -> this MCP handler -> Cycles reserve -> paid-media API -> Cycles commit
```

The model supplies the proposed budget, campaign ID, change ticket, and a stable
operation ID. The gateway reads the current budget from the paid-media API and
passes it back as an optimistic-concurrency condition on the write. Security scope is
server-controlled: tenant, member/credential boundary, workflow, paid-media
account, and maximum daily budget all come from environment configuration.

## What the example proves

- The paid-media API has no bypass around the Cycles reservation in this tool.
- A denied or unavailable reservation prevents dispatch.
- The risk estimate uses the provider's current budget, not a model assertion.
- A concurrent budget change makes the downstream write fail instead of silently
  applying an estimate based on stale state.
- The MCP endpoint is authenticated and rate-limited. The defaults allow 60
  requests per source address per 60-second window.
- Every stateless MCP POST receives a fresh server transport, as required by
  the MCP SDK; transports are closed when their HTTP response completes.
- `operationId` becomes the Cycles and downstream idempotency key.
- `X-Cycles-Reservation-ID` and the provider request ID correlate audit records.
- Cancellation before dispatch releases the reservation.
- Failure after dispatch commits the caller-assigned exposure because the
  downstream outcome may be unknown.
- A model-supplied Bot name is not treated as a security principal. Unless a
  verified Bot identity is supplied by trusted infrastructure, the example
  uses the member-level value `member-shared`.

The sample does **not** prove that a person approved the action. Configure Grok
Bot Auto Review to require approval for `apply_campaign_daily_budget`, and keep
normal application authorization in the downstream service.

## Run locally

Prerequisites:

- Node.js 20+
- A running Cycles server with a funded `RISK_POINTS` ledger matching the
  configured subject
- A Cycles runtime API key with reservation, commit, and release permissions

From the `cycles-mcp-server` repository root:

```bash
npm install
npm run example:grok-bot:mock
```

In a second terminal, configure and start the MCP gateway:

```bash
export CYCLES_BASE_URL=http://localhost:7878
export CYCLES_API_KEY=cyc_live_replace_me
export CYCLES_TENANT=acme
export GROK_MEMBER_SCOPE=alice-paid-media
export GROK_WORKFLOW=nightly-campaign-review
export PAID_MEDIA_ACCOUNT_ID=ads-acme
export PAID_MEDIA_API_URL=http://127.0.0.1:4100
export PAID_MEDIA_API_TOKEN=demo-paid-media-token
export MAX_DAILY_BUDGET_USD=5000
export MCP_HTTP_AUTH_TOKEN=replace-with-a-long-random-token
export MCP_RATE_LIMIT_MAX=60
export MCP_RATE_LIMIT_WINDOW_MS=60000
npm run example:grok-bot
```

The gateway listens at `http://127.0.0.1:3001/mcp`. Grok's servers cannot
reach localhost, so use a properly authenticated public deployment or a
temporary HTTPS tunnel for evaluation. Never expose the gateway without
`MCP_HTTP_AUTH_TOKEN`; the example refuses to start without it.

In a container or remote host, set `HOST=0.0.0.0` and terminate TLS at a
trusted reverse proxy. If connector requests include an `Origin` header, set
`MCP_ALLOWED_ORIGINS` to the exact comma-separated origins you intend to allow;
the gateway rejects any supplied origin that is not configured.

Add the public `/mcp` URL as a custom connector in Grok and complete its API-key
authentication flow. Grok Bot exposes installed connectors as plugins. Require
approval for the mutation tool before enabling a routine.

For a test call, use a unique operation ID once and reuse it for retries:

```json
{
  "operationId": "campaign-change-MKT-1042",
  "campaignId": "cmp_search_us",
  "proposedDailyBudgetUsd": 950,
  "changeTicket": "MKT-1042"
}
```

## Production changes

This is a reference boundary, not a complete paid-media integration. Before
production use:

- Replace the single shared MCP token with OAuth or an identity-aware gateway.
- Enforce distributed rate limits at the edge; the built-in memory store is
  per process and intended as a safe example default.
- Resolve `GROK_MEMBER_SCOPE` from authenticated connector identity rather than
  sharing one deployment across members.
- Set `GROK_VERIFIED_BOT_SCOPE` only when trusted infrastructure supplies a
  stable Bot identifier; never copy it from natural-language tool input.
- Make the downstream operation idempotent on `Idempotency-Key`.
- Make its expected-current-budget check atomic with the mutation.
- Persist audit output and pending settlements instead of relying on stderr.
- Add a durable worker that retries an unconfirmed Cycles commit with the same
  idempotency key.
- Keep destination-service authorization, account limits, Grok Bot approval,
  and Cycles authority as separate required gates.

See the companion article,
[Grok Bot Has a Computer. Where Does Cycles Fit?](https://runcycles.io/blog/grok-bot-runtime-authority),
and the general [MCP enforcement pattern](https://runcycles.io/blog/mcp-tool-budgets-before-execution).

## Verification

The repository test suite includes a loopback HTTP integration harness. It
uses the official MCP client against the gateway while separate local services
stand in for Cycles and the paid-media provider. The harness verifies the full
request order, trusted subject scope, risk calculation, idempotency and
correlation headers, commit behavior, fail-closed denial and outage behavior,
stale-write handling, bearer authentication, origin policy, and rate limits.

Run it with the rest of the suite:

```bash
npm test
npm run test:coverage
```
