import { describe, it, expect } from "vitest";
import { MockClientAdapter } from "../src/client-adapter.js";
import { createServer, VERSION } from "../src/server.js";

describe("createServer", () => {
  it("creates server with correct info", () => {
    const adapter = new MockClientAdapter();
    const server = createServer(adapter);
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  it("VERSION is set", () => {
    expect(VERSION).toBe("0.1.0");
  });

  it("has all 9 tools registered", () => {
    const adapter = new MockClientAdapter();
    const server = createServer(adapter);
    const tools = (server as any)._registeredTools;
    const names = Object.keys(tools);
    expect(names).toHaveLength(9);
    expect(names).toContain("cycles_reserve");
    expect(names).toContain("cycles_commit");
    expect(names).toContain("cycles_release");
    expect(names).toContain("cycles_extend");
    expect(names).toContain("cycles_decide");
    expect(names).toContain("cycles_check_balance");
    expect(names).toContain("cycles_list_reservations");
    expect(names).toContain("cycles_get_reservation");
    expect(names).toContain("cycles_create_event");
  });

  it("has resources registered", () => {
    const adapter = new MockClientAdapter();
    const server = createServer(adapter);
    const resources = (server as any)._registeredResources;
    const templates = (server as any)._registeredResourceTemplates;
    const totalResources =
      Object.keys(resources).length + Object.keys(templates).length;
    expect(totalResources).toBe(4);
  });

  it("has all 3 prompts registered", () => {
    const adapter = new MockClientAdapter();
    const server = createServer(adapter);
    const prompts = (server as any)._registeredPrompts;
    const names = Object.keys(prompts);
    expect(names).toHaveLength(3);
    expect(names).toContain("integrate_cycles");
    expect(names).toContain("diagnose_overrun");
    expect(names).toContain("design_budget_strategy");
  });

  it("close() shuts down cleanly", async () => {
    const adapter = new MockClientAdapter();
    const server = createServer(adapter);
    await expect(server.close()).resolves.not.toThrow();
  });
});
