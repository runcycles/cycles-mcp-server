# Cycles Protocol v0.1.23 — MCP Server Audit

**Date:** 2026-03-19
**Spec:** `cycles-protocol-v0.yaml` (OpenAPI 3.1.0, v0.1.23)
**MCP Server:** `@runcycles/mcp-server` v0.1.0 (Node 20+ / @modelcontextprotocol/sdk / TypeScript 5)
**Client dependency:** `runcycles` v0.1.1 (TypeScript client, audited separately in `cycles-client-typescript/AUDIT.md`)

---

## Summary

| Category | Pass | Issues |
|----------|------|--------|
| MCP Tools ↔ Protocol Endpoints | 9/9 | 0 |
| Tool Input Schemas ↔ Spec Request Schemas | 9/9 | 0 |
| Tool Output Schemas ↔ Spec Response Schemas | 9/9 | 0 |
| Enum Values in Zod Schemas | 5/5 | 0 |
| Auth (X-Cycles-API-Key delegation) | — | 0 |
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

### Auth (correct — delegated to runcycles)

- Auth is handled by `runcycles` CyclesClient, which sets `X-Cycles-API-Key` header on all requests
- MCP server's `RealClientAdapter` constructs `CyclesClient` via `CyclesConfig.fromEnv()`, reading `CYCLES_API_KEY` env var
- The MCP server itself does not handle auth — it delegates entirely to the underlying client library

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

- 148 tests across 8 test files
- Line coverage: 96.88% (threshold: 95%)
- Branch coverage: 94.73% (threshold: 85%)
- All tool handlers tested: happy path, error paths, edge cases
- Mock responses validated for structural match to protocol types
- Client adapter tested for both real (mocked fetch) and mock implementations

---

## Verdict

The MCP server is **fully protocol-conformant** with the Cycles Protocol v0.1.23 OpenAPI spec. All 9 tools map 1:1 to protocol endpoints. Zod input schemas enforce the same constraints as the spec (required fields, enum values, numeric bounds). Tool outputs match spec response schemas via `runcycles` wire-format mappers. Auth, idempotency, and subject validation are correctly delegated to or validated against the spec. Mock responses are structurally identical to real protocol responses. No open issues.
