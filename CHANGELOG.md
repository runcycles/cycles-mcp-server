# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

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
