# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Claude Desktop extension bundle (`.mcpb`): every GitHub release now attaches `cycles-mcp-server-<version>.mcpb` — a self-contained single-file bundle with a config UI for the Cycles server URL, API key, and mock mode. Built via `npm run build:mcpb` (single-file CJS bundle, all dependencies inlined, docs included; validated and packed with the pinned `@anthropic-ai/mcpb` CLI invoked ephemerally so its dependency tree stays out of this package's). The archive includes this project's Apache-2.0 `LICENSE` (§4(a) redistribution requirement) and a generated `THIRD-PARTY-NOTICES.md` with the full license texts of all 94 inlined packages, since the bundler strips their comment-level notices.

### Fixed

- `cycles://docs/quickstart` and `cycles://docs/patterns` resources returned "Documentation file ... not found" in every published npm version (0.1.0–0.4.0): the docs path was resolved relative to the source layout (`../../docs`), but tsup bundles everything into `dist/index.js`, from which that path escapes the package. Path resolution now tries the bundled layout (`../docs`) first, then the source layout, and works in ESM dist, the CJS MCPB bundle, tsx dev, and vitest. The post-publish smoke test now reads the quickstart resource from the published artifact so this class of bug gates the release.

## [0.4.0] - 2026-07-21

Tool-metadata and release-pipeline release. Tools now carry MCP titles, annotations, and output schemas — hosts can auto-approve the read-only tools and consume typed `structuredContent`. First release published via npm Trusted Publishing (OIDC) and gated by the post-publish smoke test.

### Added

- All 9 tools now declare MCP tool metadata: display `title`, `annotations` (`cycles_check_balance`, `cycles_list_reservations`, and `cycles_get_reservation` are marked `readOnlyHint: true` so hosts can auto-approve them; all mutating tools are `idempotentHint: true` / `destructiveHint: false`, reflecting the protocol's mandatory idempotency keys; all tools are `openWorldHint: false`), and `outputSchema` derived from the spec response schemas. Successful tool results now include `structuredContent` alongside the existing JSON text content.
- Post-publish smoke test in CI: after every npm publish, a job installs the just-published version from the registry in a clean directory, performs a real MCP initialize handshake over stdio, verifies all 9 tools and their metadata, and exercises `cycles_check_balance` and `cycles_reserve` in mock mode. The MCP Registry publish and GitHub Release now run only if the smoke test passes.

### Changed

- npm publish now uses npm Trusted Publishing (OIDC) instead of a long-lived `NPM_TOKEN` secret. The 0.3.0 release failed on first attempt because the token had expired; OIDC removes that failure mode. Requires the trusted publisher to be configured for the package on npmjs.com before the next release.
- `package.json` metadata normalized per `npm pkg fix` (`repository.url` gains the `git+` prefix; `bin` path drops the `./` prefix) so npm stops auto-correcting it at publish time.

## [0.3.0] - 2026-07-21

Security-hardening release. The minor bump signals two behavior changes that can affect existing deployments: mock mode now refuses to start in production without an explicit override, and blank `MCP_HTTP_AUTH_TOKEN` values now refuse startup instead of silently disabling authentication.

### Added

- Optional `MCP_HTTP_AUTH_TOKEN` bearer authentication for all Streamable HTTP `/mcp` methods. Configured requests without the exact `Authorization: Bearer <token>` header receive `401 Unauthorized`; stdio transport and `/health` are unchanged.
- README "Security Model & Enforcement Boundary" section documenting what is enforced unconditionally server-side versus cooperatively in the agent loop, and how to make enforcement non-bypassable via host-gated dispatch or dispatch-path middleware.
- The `integrate_cycles` prompt now instructs generated integrations to place the reserve check in the dispatch path (wrapper/middleware/gateway) so costly operations are unreachable without a successful reservation.

### Changed

- Mock reservation and event IDs now use a `mock_` prefix so downstream consumers can identify synthetic results.
- The MCP server runtime version is derived from `package.json` instead of a stale hardcoded constant.
- `.env.example` now defaults `CYCLES_MOCK=false` and documents the enforcement implications of enabling it.

### Security

- Mock mode now emits a prominent warning on every startup and is refused when `NODE_ENV=production` unless `CYCLES_ALLOW_MOCK_IN_PRODUCTION=true` is explicitly set.
- Unauthenticated HTTP startup now emits a prominent warning whenever the bind address is not loopback.
- Explicitly configured blank or whitespace-only `MCP_HTTP_AUTH_TOKEN` values now refuse startup instead of disabling authentication.
- Forced transitive `esbuild` to >= 0.28.1 via npm `overrides`, resolving Dependabot alert #26 (low severity, dev-only: arbitrary file read via the esbuild development server on Windows). Remove the override once `tsup` allows esbuild >= 0.28.

### Fixed

- `server.json` registry metadata now marks `CYCLES_BASE_URL` as required. It was previously listed as optional with a default of `https://api.runcycles.io`, but the runtime has no such fallback — `CyclesConfig.fromEnv()` (used by `RealClientAdapter` in `src/client-adapter.ts`) throws if the variable is unset, so the server fails to start without it. The misleading `default` is removed; the URL is kept in the description as an example value. `docs/quickstart.md` (served as the `cycles://docs/quickstart` resource) carried the same "optional" claim and is corrected to "required".

## [0.2.4] - 2026-05-03

### Changed

- Add `runtimeHint: "npx"` to `server.json` package metadata so MCP discovery catalogs (e.g. MatrixHub) can enable our entry. Earlier ingests had been disabled with reason "Missing required package metadata (runtimeHint or identifier)".

### Notes

- Version 0.2.3 was published to the MCP Registry only (manually, with package version still pinned to npm 0.2.2) while diagnosing the runtimeHint issue. Skipping 0.2.3 on npm and resyncing both surfaces at 0.2.4 keeps versions aligned across npm and the MCP Registry. No code changes vs 0.2.2 — metadata-only release.

## [0.2.2] - 2026-04-20

### Changed

- Enriched MCP Registry metadata: server now publishes a human-readable `title`, `websiteUrl`, and per-environment-variable descriptions/defaults so the listing is actually useful in the registry UI.
- `CYCLES_API_KEY` is now correctly marked as required in the registry metadata (mock mode for local dev is documented separately).
- Trimmed the registry `description` to fit the 100-char limit so the publish step stops failing validation.

### Notes

- v0.2.1 was published to npm but failed at the MCP Registry publish step (description length); v0.2.2 is the first release where both publishes succeeded. Users on 0.2.1 should upgrade — no functional changes between 0.2.1 and 0.2.2 beyond the registry metadata fix.

## [0.2.0] - 2026-03-24

Support for 0.1.24 protocol spec.

### Added

- Add documentation links to README.

### Changed

- Claude/cycles mcp server ha rv d.
- Clarify `ALLOW_IF_AVAILABLE` as default overage policy.
- Bump version to 0.2.0 for protocol v0.1.24.

## [0.1.1] - 2026-03-19

Fix MCP Registry publishing to use official mcp-publisher.

### Added

- Add standalone MCP Registry publish workflow with manual trigger.

### Changed

- Shorten `server.json` description to meet 100-char registry limit.
- Bump version to 0.1.1 for MCP Registry publish.

### Fixed

- Fix MCP Registry publishing to use official mcp-publisher CLI.

## [0.1.0] - 2026-03-19

Initial public release.

### Added

- Add Cycles MCP server implementation with tools, resources, and prompts.
- Add API key creation instructions to README.
