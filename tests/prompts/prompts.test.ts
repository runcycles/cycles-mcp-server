import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllPrompts } from "../../src/prompts/index.js";

let server: McpServer;

function getPromptCallback(name: string): Function {
  const prompts = (server as any)._registeredPrompts;
  const prompt = prompts[name];
  if (!prompt) throw new Error(`Prompt ${name} not registered`);
  return prompt.callback;
}

beforeEach(() => {
  server = new McpServer({ name: "test", version: "0.0.1" });
  registerAllPrompts(server);
});

describe("integrate_cycles prompt", () => {
  it("returns messages with default language", async () => {
    const cb = getPromptCallback("integrate_cycles");
    const result = await cb({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("typescript");
    expect(result.messages[0].content.text).toContain("reserve");
    expect(result.messages[0].content.text).toContain("commit");
  });

  it("uses specified language", async () => {
    const cb = getPromptCallback("integrate_cycles");
    const result = await cb({ language: "python", use_case: "api-gateway" });
    expect(result.messages[0].content.text).toContain("python");
    expect(result.messages[0].content.text).toContain("api-gateway");
  });
});

describe("diagnose_overrun prompt", () => {
  it("returns diagnostic steps with no args", async () => {
    const cb = getPromptCallback("diagnose_overrun");
    const result = await cb({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("Diagnose");
    expect(result.messages[0].content.text).toContain("Zombie reservations");
  });

  it("includes reservation_id when provided", async () => {
    const cb = getPromptCallback("diagnose_overrun");
    const result = await cb({ reservation_id: "rsv_abc" });
    expect(result.messages[0].content.text).toContain("rsv_abc");
  });

  it("includes scope when provided", async () => {
    const cb = getPromptCallback("diagnose_overrun");
    const result = await cb({ scope: "acme" });
    expect(result.messages[0].content.text).toContain("acme");
  });
});

describe("design_budget_strategy prompt", () => {
  it("returns strategy guidance", async () => {
    const cb = getPromptCallback("design_budget_strategy");
    const result = await cb({ description: "Multi-agent research workflow" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("Multi-agent research workflow");
    expect(result.messages[0].content.text).toContain("Subject Hierarchy");
    expect(result.messages[0].content.text).toContain("Unit Selection");
  });

  it("includes tenant model when provided", async () => {
    const cb = getPromptCallback("design_budget_strategy");
    const result = await cb({
      description: "SaaS platform",
      tenant_model: "per-customer",
    });
    expect(result.messages[0].content.text).toContain("per-customer");
  });
});
