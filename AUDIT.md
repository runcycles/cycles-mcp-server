# Cycles Protocol v0.1.24 — MCP Server Audit

**Date:** 2026-07-18
**Spec:** `cycles-protocol-v0.yaml` (OpenAPI 3.1.0, v0.1.24)
**MCP Server:** `@runcycles/mcp-server` v0.2.4 (Node 20+ / `@modelcontextprotocol/sdk` / TypeScript 6)
**Client dependency:** `runcycles` ^0.3.0 (TypeScript client, audited separately in `cycles-client-typescript/AUDIT.md`)

---

## Summary

| Category | Pass | Issues |
|----------|------|--------|
| MCP Tools ↔ Protocol Endpoints | 9/9 | 0 |
| Tool Input Schemas ↔ Spec Request Schemas | 9/9 | 0 |
| Tool Output Schemas ↔ Spec Response Schemas | 9/9 | 0 |
| Enum Values in Zod Schemas | 5/5 | 0 |
| Auth (X-Cycles-API-Key delegation) | — | 0 |
| MCP HTTP Bearer Auth / Bind Warnings | — | 0 |
| Mock-Mode Startup Safety | — | 0 |
| Idempotency Key Propagation | — | 0 |
| Subject Validation (≥1 standard field) | — | 0 |
| Error Handling (protocol error codes) | — | 0 |
| MCP Resources | 4/4 | 0 |
| MCP Prompts | 3/3 | 0 |
| Test Coverage | — | 0 |

**Overall: MCP server is protocol-conformant.** All 9 tools map 1:1 to protocol endpoints. Zod input schemas match spec request schemas. Tool outputs match spec response schemas via `runcycles` wire-format mappers. Enum values match spec exactly. No open issues.

---

## Audit Scope

Compared the following across spec YAML, `runcycles` client types, and MCP server Zod schemas:
- All 9 MCP tool names and their corresponding protocol endpoints
- All tool input Zod schemas vs spec request schemas (field names, types, constraints)
- All tool output shapes vs spec response schemas (via `runcycles` mapper functions)
- All 5 enum types and their Zod enum values
- Auth delegation through `runcycles` CyclesClient
- Optional bearer authentication and unauthenticated bind warnings for Streamable HTTP
- Mock-mode warning, production refusal, and detectable synthetic identifiers
- Idempotency key propagation through `runcycles` client (body + header sync)
- Subject validation (at least one standard field) in tool handlers
- Mock responses structural match to spec response schemas
- Wire-format conversion via `runcycles` mappers (audited separately in `cycles-client-typescript/AUDIT.md`)

---

## PASS — Correctly Implemented

### MCP Tools ↔ Protocol Endpoints (all 9 match)

| Spec Endpoint | MCP Tool | HTTP Method | Match |
|---|---|---|---|
| `/v1/reservations` (create) | `cycles_reserve` | POST | PASS |
| `/v1/reservations/{id}/commit` | `cycles_commit` | POST | PASS |
| `/v1/reservations/{id}/release` | `cycles_release` | POST | PASS |
| `/v1/reservations/{id}/extend` | `cycles_extend` | POST | PASS |
| `/v1/decide` | `cycles_decide` | POST | PASS |
| `/v1/balances` | `cycles_check_balance` | GET | PASS |
| `/v1/reservations` (list) | `cycles_list_reservations` | GET | PASS |
| `/v1/reservations/{id}` (get) | `cycles_get_reservation` | GET | PASS |
| `/v1/events` | `cycles_create_event` | POST | PASS |

### Tool Input Schemas ↔ Spec Request Schemas (all match)

**cycles_reserve** — spec required: `[idempotency_key, subject, action, estimate]`
- Zod schema: `idempotencyKey` (string, required), `subject` (SubjectObjectSchema), `action` (ActionSchema), `estimate` (AmountSchema), plus optional `ttlMs` (1000–86400000), `gracePeriodMs` (0–60000), `overagePolicy` (enum), `dryRun` (boolean), `metadata` (record)
- Subject validation enforced in handler (≥1 standard field)

**cycles_commit** — spec required: `[idempotency_key, actual]`
- Zod schema: `reservationId` (string, required), `idempotencyKey` (string, required), `actual` (AmountSchema), plus optional `metrics` (MetricsObjectSchema), `metadata` (record)

**cycles_release** — spec required: `[idempotency_key]`
- Zod schema: `reservationId` (string, required), `idempotencyKey` (string, required), plus optional `reason` (string, max 256)

**cycles_extend** — spec required: `[idempotency_key, extend_by_ms]`
- Zod schema: `reservationId` (string, required), `idempotencyKey` (string, required), `extendByMs` (int, 1–86400000), plus optional `metadata` (record)

**cycles_decide** — spec required: `[idempotency_key, subject, action, estimate]`
- Zod schema: `idempotencyKey` (string, required), `subject` (SubjectObjectSchema), `action` (ActionSchema), `estimate` (AmountSchema), plus optional `metadata` (record)
- Subject validation enforced in handler

**cycles_check_balance** — spec query params: `tenant, workspace, app, workflow, agent, toolset, include_children, limit, cursor`
- Zod schema: all optional strings for subject fields, plus `includeChildren` (boolean), `limit` (1–200), `cursor` (string)
- At least one subject filter enforced in handler

**cycles_list_reservations** — spec query params: `idempotency_key, status, tenant, workspace, app, workflow, agent, toolset, limit, cursor`
- Zod schema: all optional, `status` uses `ReservationStatusEnum`

**cycles_get_reservation** — spec path param: `reservation_id`
- Zod schema: `reservationId` (string, required, 1–128)

**cycles_create_event** — spec required: `[idempotency_key, subject, action, actual]`
- Zod schema: `idempotencyKey` (string, required), `subject` (SubjectObjectSchema), `action` (ActionSchema), `actual` (AmountSchema), plus optional `overagePolicy` (enum), `metrics` (MetricsObjectSchema), `clientTimeMs` (int), `metadata` (record)
- Subject validation enforced in handler

### Tool Output Schemas ↔ Spec Response Schemas (all match via runcycles mappers)

| Spec Response Schema | runcycles Mapper | MCP Tool | Match |
|---|---|---|---|
| `ReservationCreateResponse` | `reservationCreateResponseFromWire()` | `cycles_reserve` | PASS |
| `CommitResponse` | `commitResponseFromWire()` | `cycles_commit` | PASS |
| `ReleaseResponse` | `releaseResponseFromWire()` | `cycles_release` | PASS |
| `ReservationExtendResponse` | `reservationExtendResponseFromWire()` | `cycles_extend` | PASS |
| `DecisionResponse` | `decisionResponseFromWire()` | `cycles_decide` | PASS |
| `BalanceResponse` | `balanceResponseFromWire()` | `cycles_check_balance` | PASS |
| `ReservationListResponse` | `reservationListResponseFromWire()` | `cycles_list_reservations` | PASS |
| `ReservationDetail` | `reservationDetailFromWire()` | `cycles_get_reservation` | PASS |
| `EventCreateResponse` | `eventCreateResponseFromWire()` | `cycles_create_event` | PASS |

### Enum Values in Zod Schemas (all match spec)

| Spec Enum | Zod Schema | Values | Match |
|---|---|---|---|
| `DecisionEnum` | (returned by runcycles) | `ALLOW`, `ALLOW_WITH_CAPS`, `DENY` | PASS |
| `UnitEnum` | `UnitEnum` | `USD_MICROCENTS`, `TOKENS`, `CREDITS`, `RISK_POINTS` | PASS |
| `CommitOveragePolicy` | `CommitOveragePolicyEnum` | `REJECT`, `ALLOW_IF_AVAILABLE`, `ALLOW_WITH_OVERDRAFT` | PASS |
| `ReservationStatus` | `ReservationStatusEnum` | `ACTIVE`, `COMMITTED`, `RELEASED`, `EXPIRED` | PASS |
| `ErrorCode` | (returned by runcycles) | All 12 spec values + `UNKNOWN` (client fallback) | PASS |

### Auth (correct — Cycles API delegation and MCP HTTP boundary)

- Auth is handled by `runcycles` CyclesClient, which sets `X-Cycles-API-Key` header on all requests
- MCP server's `RealClientAdapter` constructs `CyclesClient` via `CyclesConfig.fromEnv()`, reading `CYCLES_API_KEY` env var
- Streamable HTTP optionally enforces `MCP_HTTP_AUTH_TOKEN` on every `/mcp` method using an exact bearer-token check and returns `401 Unauthorized` with `WWW-Authenticate: Bearer` on failure
- Blank or whitespace-only configured HTTP auth tokens refuse startup before the MCP server connects or listens
- The `/health` endpoint remains public, and stdio transport is unchanged
- Unauthenticated non-loopback HTTP binds emit a prominent startup warning

### Idempotency Key Propagation (correct — delegated to runcycles)

- All mutating tool inputs include `idempotencyKey` (required string)
- `runcycles` request mappers (e.g., `reservationCreateRequestToWire()`) map `idempotencyKey` → `idempotency_key` in the wire body
- `runcycles` CyclesClient `_post()` method extracts `idempotency_key` from the body and sets it as the `X-Idempotency-Key` header
- Header and body values always match per spec requirement

### Subject Validation (correct — enforced in tool handlers)

- Tools that accept a `subject` parameter (`cycles_reserve`, `cycles_decide`, `cycles_create_event`) validate that at least one standard field (tenant, workspace, app, workflow, agent, toolset) is present
- `cycles_check_balance` validates that at least one subject filter query parameter is present
- Validation functions: `validateSubject()` and `validateBalanceFilter()` in `schemas.ts`
- Matches spec `anyOf` constraint on Subject and normative requirement on `/v1/balances`

### Error Handling (correct)

- `RealClientAdapter.assertSuccess()` checks `CyclesResponse.isSuccess` and throws `CyclesApiError` on failure
- `CyclesApiError` carries: `errorCode` (from spec `ErrorCode` enum), `message`, `requestId`, `httpStatus`, `details`
- Tool handlers catch errors and return MCP-compliant `{ isError: true, content: [...] }` with structured JSON
- Protocol error codes (BUDGET_EXCEEDED, RESERVATION_EXPIRED, RESERVATION_FINALIZED, etc.) are preserved in tool error responses

### MCP Resources (all 4 correct)

| Resource URI | Type | Data Source | Match |
|---|---|---|---|
| `cycles://balances/{tenant}` | Template | `adapter.getBalances()` → JSON | PASS |
| `cycles://reservations/{reservation_id}` | Template | `adapter.getReservation()` → JSON | PASS |
| `cycles://docs/quickstart` | Static | `docs/quickstart.md` | PASS |
| `cycles://docs/patterns` | Static | `docs/patterns.md` | PASS |

### MCP Prompts (all 3 correct)

| Prompt Name | Arguments | Match |
|---|---|---|
| `integrate_cycles` | `language` (optional), `use_case` (optional) | PASS |
| `diagnose_overrun` | `reservation_id` (optional), `scope` (optional) | PASS |
| `design_budget_strategy` | `description` (required), `tenant_model` (optional) | PASS |

### Test Coverage (correct)

- 177 tests across 8 test files
- Line coverage: 98.94% (threshold: 95%)
- Branch coverage: 93.75% (threshold: 85%)
- All tool handlers tested: happy path, error paths, edge cases
- Mock responses validated for structural match to protocol types
- Client adapter tested for both real (mocked fetch) and mock implementations

---

## Previously Found Issues (all fixed)

### 1. `cycles_list_reservations` — idempotencyKey query param sent in camelCase

**Before:** The tool mapped `idempotencyKey` directly as a camelCase query parameter, but the Cycles API expects `idempotency_key` (snake_case) in query strings.

**Fix:** Explicitly convert `params.idempotencyKey` to `queryParams.idempotency_key` in `src/tools/cycles-list-reservations.ts`, matching the pattern already used for `includeChildren` → `include_children` in `cycles-check-balance.ts`.

### 2. `ListReservationsInputSchema.idempotencyKey` — missing length constraints

**Before:** `idempotencyKey: z.string().optional()` — no length validation.

**Fix:** Changed to `z.string().min(1).max(256).optional()` to match the spec's `IdempotencyKey` schema (minLength: 1, maxLength: 256).

### 3. `SubjectObjectSchema.dimensions` — missing maxProperties constraint

**Before:** `dimensions: z.record(z.string(), z.string().max(256)).optional()` — no limit on number of entries.

**Fix:** Added `.refine((d) => Object.keys(d).length <= 16, ...)` to enforce the spec's `maxProperties: 16` constraint on custom dimensions.

---

## CI / CD Pipeline

| Job | Trigger | Steps |
|-----|---------|-------|
| `test` | Push to main/master, PRs, manual dispatch | typecheck → lint → build → test:coverage (Node 20, 22 matrix) |
| `publish` (npm) | `v*` tag push | build → `npm publish --provenance --access public` |
| `publish-registry` (MCP Registry) | `v*` tag push (after npm) | `./mcp-publisher publish` (root `server.json`) |

**ESLint:** Flat config (`eslint.config.js`) with `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`. Lints `src/**/*.ts`.

## Publishing

| Target | Identifier | Status |
|--------|-----------|--------|
| npm | `@runcycles/mcp-server` | Ready — CI publishes on `v*` tag |
| MCP Registry | `io.github.runcycles/cycles-mcp-server` | Ready — root `server.json` manifest with title, categories, keywords |

npm package includes: `dist/`, `docs/`, `server.json`, `LICENSE`, `README.md`.

---

## Verdict

The MCP server is **fully protocol-conformant** with the Cycles Protocol v0.1.24 OpenAPI spec. All 9 tools map 1:1 to protocol endpoints. Zod input schemas enforce the same constraints as the spec (required fields, enum values, numeric bounds). Tool outputs match spec response schemas via `runcycles` wire-format mappers. Auth, idempotency, and subject validation are correctly delegated to or validated against the spec. Mock responses remain protocol-shaped while generated mock identifiers are visibly tagged. CI validates typecheck, lint, build, and coverage gates. No open issues.

---

## Registry Metadata Fix — `CYCLES_BASE_URL` Marked Required (2026-07-09)

**Files:** `server.json`, `docs/quickstart.md`, `CHANGELOG.md`. **No code changes** — registry-metadata and docs fix; runtime behavior is unchanged.

**Issue:** `server.json` listed `CYCLES_BASE_URL` as `isRequired: false` with `"default": "https://api.runcycles.io"`, but the runtime has no such fallback. `RealClientAdapter` (`src/client-adapter.ts`) constructs its client via `CyclesConfig.fromEnv()`, which throws `CYCLES_BASE_URL environment variable is required` when the variable is unset — so the server fails to start without it (except in `CYCLES_MOCK=true` mode, which uses `MockClientAdapter` and reads no env config). Users following the registry metadata and omitting the variable would hit a startup crash instead of the advertised default.

**Fix:** `CYCLES_BASE_URL` is now `isRequired: true` and the misleading `default` is removed. The production URL is retained in the `description` as an example value (`"URL of the Cycles server (e.g. https://api.runcycles.io)"`), matching how `CYCLES_API_KEY` documents its mock-mode alternative in its description rather than via schema defaults.

---

## Runtime Safety and HTTP Authentication Review (2026-07-18)

### Mock mode

**Issue:** `CYCLES_MOCK=true` silently selected synthetic responses that allow operations without contacting the Cycles service, and `.env.example` enabled that mode by default.

**Fix:** `.env.example` now defaults to `false`; allowed mock startups print an unmissable warning; production startup refuses mock mode unless `CYCLES_ALLOW_MOCK_IN_PRODUCTION=true`; and generated mock reservation/event IDs begin with `mock_` for downstream detection.

### Streamable HTTP transport

**Issue:** `/mcp` had no transport-level authentication, including on non-loopback binds.

**Fix:** `MCP_HTTP_AUTH_TOKEN`, when set, requires the exact `Authorization: Bearer <token>` header for POST, GET, and DELETE `/mcp` requests. Missing or incorrect credentials return `401` without reaching the MCP transport. Blank or whitespace-only configured tokens refuse startup before the server connects or listens. When the token is unset and the bind is non-loopback, startup emits a prominent warning. Stdio and the public `/health` endpoint are unchanged.

### Version reporting

**Issue:** Server metadata and `/health` reported a hardcoded `0.2.0` while `package.json` was `0.2.4`.

**Fix:** Runtime version metadata is loaded from `package.json`, eliminating the duplicate version constant.

---

## Dependency Advisory — esbuild < 0.28.1 (2026-07-21)

**Files:** `package.json`, `package-lock.json`. **No runtime changes** — esbuild is a development-only transitive dependency (via `tsup`, `tsx`, `vitest`/`vite`); nothing ships in `dist/`.

**Issue:** Dependabot alert #26 (low severity): esbuild >= 0.27.3, < 0.28.1 allows arbitrary file read when running the development server on Windows. The lockfile resolved esbuild 0.27.4. No Dependabot PR was raised because no direct dependency range reaches the patched version: `tsup` (even at latest 8.5.1) pins `esbuild ^0.27.0`.

**Fix:** Added an npm `overrides` entry forcing `esbuild ^0.28.1` tree-wide; the reinstall resolved esbuild 0.28.1 everywhere and refreshed in-range dev deps (`tsx` 4.23.1, `vitest` 4.1.10 / `vite` 8.1.4). `npm audit` reports 0 vulnerabilities. The override should be removed once `tsup` moves its esbuild range to >= 0.28.

**Verified (2026-07-21):** `npm run build` (tsup on esbuild 0.28.1), full test suite with coverage (98.94% lines / 93.75% branches), `typecheck`, and `lint` all pass.

---

## Enforcement-Boundary Documentation (2026-07-21)

**Files:** `README.md`, `src/prompts/integrate-cycles.ts`, `tests/prompts/prompts.test.ts`. **No protocol-conformance changes** — tool schemas, wire formats, and runtime behavior are unchanged.

**Issue:** The README promised "enforce ... before execution, with zero agent code changes" without documenting the enforcement boundary. In reality, only server-side policy evaluation is unconditional (oversized or malformed reservations cannot grant authority beyond policy; nothing is spent before commit). Honoring a denial *inside the agent's tool loop* is cooperative: this MCP server does not intercept the host's other tools, so a prompt-injected or misbehaving agent could skip `cycles_reserve` and invoke a consequential tool directly. Raised by an external security question (2026-07-21).

**Fix:** Added a "Security Model & Enforcement Boundary" README section distinguishing (a) unconditional server-side enforcement (schema rejection of malformed/unsafe amounts, `BUDGET_EXCEEDED` refusal of excessive reserves, spend-only-on-commit), (b) cooperative in-loop behavior, and (c) how to make enforcement non-bypassable (host-gated dispatch, dispatch-path middleware, `cycles_create_event` metering backstop), plus an explicit "mock mode enforces nothing" note. The `integrate_cycles` prompt now instructs generated integrations to place the reserve check in the dispatch path (wrapper/middleware/gateway) so the costly operation is unreachable without a successful reservation, with `cycles_create_event` as the metering fallback. A regression test asserts the prompt carries this guidance.

**Verified (2026-07-21):** `AmountSchema` (`z.number().int().nonnegative()` under Zod 4) rejects values above `Number.MAX_SAFE_INTEGER` at runtime and advertises `maximum: 9007199254740991` in the generated JSON Schema — no schema change required.
