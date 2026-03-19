import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MockClientAdapter } from "../../src/client-adapter.js";
import { registerAllResources } from "../../src/resources/index.js";

let server: McpServer;
let adapter: MockClientAdapter;

function getResourceCallback(name: string): Function {
  const resources = (server as any)._registeredResources;
  const templates = (server as any)._registeredResourceTemplates;

  if (resources[name]) return resources[name].readCallback ?? resources[name].handler;
  if (templates[name]) return templates[name].readCallback ?? templates[name].handler;

  throw new Error(
    `Resource ${name} not registered. Available: ${[
      ...Object.keys(resources),
      ...Object.keys(templates),
    ].join(", ")}`,
  );
}

beforeEach(() => {
  server = new McpServer({ name: "test", version: "0.0.1" });
  adapter = new MockClientAdapter();
  registerAllResources(server, adapter);
});

describe("cycles-balance resource", () => {
  it("returns balance JSON for tenant", async () => {
    const cb = getResourceCallback("cycles-balance");
    const result = await cb(new URL("cycles://balances/acme"), { tenant: "acme" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");
    const body = JSON.parse(result.contents[0].text);
    expect(body.balances).toBeDefined();
    expect(body.balances[0].scope).toContain("tenant:acme");
  });
});

describe("cycles-reservation resource", () => {
  it("returns reservation detail", async () => {
    const cb = getResourceCallback("cycles-reservation");
    const result = await cb(new URL("cycles://reservations/rsv_123"), {
      reservation_id: "rsv_123",
    });
    expect(result.contents).toHaveLength(1);
    const body = JSON.parse(result.contents[0].text);
    expect(body.reservationId).toBe("rsv_123");
  });
});

describe("cycles-docs-quickstart resource", () => {
  it("returns markdown content", async () => {
    const cb = getResourceCallback("cycles://docs/quickstart");
    const result = await cb(new URL("cycles://docs/quickstart"));
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("text/markdown");
    expect(result.contents[0].text).toContain("Quickstart");
  });
});

describe("cycles-docs-patterns resource", () => {
  it("returns markdown content", async () => {
    const cb = getResourceCallback("cycles://docs/patterns");
    const result = await cb(new URL("cycles://docs/patterns"));
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Agent Decision Loop");
  });
});
