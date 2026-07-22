#!/usr/bin/env node
// Post-publish smoke test: installs the just-published package from the npm
// registry via npx, speaks real MCP to it over stdio (initialize, tools/list,
// balance/reserve/release tool calls and a resource read in mock mode),
// and fails loudly if anything is broken.
//
// Usage: node scripts/smoke-test.mjs <version>
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/smoke-test.mjs <version>");
  process.exit(1);
}

const EXPECTED_TOOLS = [
  "cycles_reserve",
  "cycles_commit",
  "cycles_release",
  "cycles_extend",
  "cycles_decide",
  "cycles_check_balance",
  "cycles_list_reservations",
  "cycles_get_reservation",
  "cycles_create_event",
];

function fail(message) {
  console.error(`SMOKE TEST FAILED: ${message}`);
  process.exit(1);
}

// Spawn from an empty temp dir: inside this repo, npx would resolve the local
// package (same name/version) and test the checkout instead of the published
// registry tarball.
const scratch = mkdtempSync(join(tmpdir(), "cycles-smoke-"));

const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "npx.cmd" : "npx",
  args: ["-y", `@runcycles/mcp-server@${version}`],
  env: { ...process.env, CYCLES_MOCK: "true" },
  cwd: scratch,
});

const client = new Client({ name: "smoke-test", version: "0.0.0" });

const timeout = setTimeout(() => fail("timed out after 120s"), 120_000);

try {
  await client.connect(transport);

  const serverVersion = client.getServerVersion();
  if (serverVersion?.version !== version) {
    fail(`server reports version ${serverVersion?.version}, expected ${version}`);
  }

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  for (const expected of EXPECTED_TOOLS) {
    if (!names.includes(expected)) fail(`missing tool: ${expected}`);
  }
  const missingMeta = tools.filter((t) => !t.title || !t.annotations || !t.outputSchema);
  if (missingMeta.length > 0) {
    fail(`tools missing title/annotations/outputSchema: ${missingMeta.map((t) => t.name).join(", ")}`);
  }

  const balance = await client.callTool({
    name: "cycles_check_balance",
    arguments: { tenant: "smoke-test" },
  });
  if (balance.isError) fail(`cycles_check_balance errored: ${JSON.stringify(balance.content)}`);
  if (!Array.isArray(balance.structuredContent?.balances)) {
    fail("cycles_check_balance returned no structuredContent.balances");
  }

  const reserve = await client.callTool({
    name: "cycles_reserve",
    arguments: {
      idempotencyKey: `smoke-${version}`,
      subject: { tenant: "smoke-test" },
      action: { kind: "llm.completion", name: "smoke" },
      estimate: { unit: "TOKENS", amount: 100 },
    },
  });
  if (reserve.isError) fail(`cycles_reserve errored: ${JSON.stringify(reserve.content)}`);
  const reservationId = reserve.structuredContent?.reservationId;
  if (typeof reservationId !== "string" || !reservationId.startsWith("mock_")) {
    fail(`expected mock_ reservation id, got: ${String(reservationId)}`);
  }

  const release = await client.callTool({
    name: "cycles_release",
    arguments: { reservationId, idempotencyKey: `smoke-rel-${version}` },
  });
  if (release.isError) fail(`cycles_release errored: ${JSON.stringify(release.content)}`);
  if (release.structuredContent?.status !== "RELEASED") fail("cycles_release did not return RELEASED");

  // Docs resources must serve real content from the published tarball —
  // path resolution differs between source and bundled layouts, and this
  // exact failure shipped silently in 0.1.0 through 0.4.0.
  const doc = await client.readResource({ uri: "cycles://docs/quickstart" });
  const docText = String(doc.contents?.[0]?.text ?? "");
  if (docText.startsWith("Documentation file") || docText.length === 0) {
    fail(`cycles://docs/quickstart returned fallback instead of content: ${JSON.stringify(docText.slice(0, 80))}`);
  }

  console.log(`SMOKE TEST PASSED: @runcycles/mcp-server@${version} — ${tools.length} tools, mock reserve OK, docs resources OK`);
} catch (err) {
  fail(err instanceof Error ? err.stack ?? err.message : String(err));
} finally {
  clearTimeout(timeout);
  await client.close().catch(() => {});
}
