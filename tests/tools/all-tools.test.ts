import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MockClientAdapter, CyclesApiError } from "../../src/client-adapter.js";
import { registerAllTools } from "../../src/tools/index.js";

let server: McpServer;
let adapter: MockClientAdapter;

function getRegisteredToolHandler(name: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered. Available: ${Object.keys(tools).join(", ")}`);
  return tool.handler;
}

beforeEach(() => {
  server = new McpServer({ name: "test", version: "0.0.1" });
  adapter = new MockClientAdapter();
  registerAllTools(server, adapter);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cycles_reserve", () => {
  it("returns reservation on success", async () => {
    const handler = getRegisteredToolHandler("cycles_reserve");
    const result = await handler({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
    });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.decision).toBe("ALLOW");
    expect(body.reservationId).toBeTruthy();
  });

  it("returns dry run without reservationId", async () => {
    const handler = getRegisteredToolHandler("cycles_reserve");
    const result = await handler({
      idempotencyKey: "k2",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
      dryRun: true,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.decision).toBe("ALLOW");
    expect(body.reservationId).toBeUndefined();
  });

  it("returns error on invalid subject", async () => {
    const handler = getRegisteredToolHandler("cycles_reserve");
    const result = await handler({
      idempotencyKey: "k3",
      subject: {},
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.message).toContain("Subject");
  });

  it("returns error on adapter failure", async () => {
    vi.spyOn(adapter, "createReservation").mockRejectedValue(
      new CyclesApiError("BUDGET_EXCEEDED", "No budget", "req-1", 409),
    );
    const handler = getRegisteredToolHandler("cycles_reserve");
    const result = await handler({
      idempotencyKey: "k4",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("BUDGET_EXCEEDED");
  });
});

describe("cycles_commit", () => {
  it("returns commit response", async () => {
    const handler = getRegisteredToolHandler("cycles_commit");
    const result = await handler({
      reservationId: "rsv_123",
      idempotencyKey: "k1",
      actual: { unit: "TOKENS", amount: 850 },
    });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.status).toBe("COMMITTED");
    expect(body.charged.amount).toBe(850);
  });

  it("returns error on adapter failure", async () => {
    vi.spyOn(adapter, "commitReservation").mockRejectedValue(
      new CyclesApiError("RESERVATION_EXPIRED", "Reservation expired", "req-2", 410),
    );
    const handler = getRegisteredToolHandler("cycles_commit");
    const result = await handler({
      reservationId: "rsv_old",
      idempotencyKey: "k2",
      actual: { unit: "TOKENS", amount: 500 },
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("RESERVATION_EXPIRED");
  });
});

describe("cycles_release", () => {
  it("returns release response", async () => {
    const handler = getRegisteredToolHandler("cycles_release");
    const result = await handler({
      reservationId: "rsv_123",
      idempotencyKey: "k1",
    });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.status).toBe("RELEASED");
  });

  it("returns error on finalized reservation", async () => {
    vi.spyOn(adapter, "releaseReservation").mockRejectedValue(
      new CyclesApiError("RESERVATION_FINALIZED", "Already committed", "req-3", 409),
    );
    const handler = getRegisteredToolHandler("cycles_release");
    const result = await handler({
      reservationId: "rsv_old",
      idempotencyKey: "k2",
    });
    expect(result.isError).toBe(true);
  });
});

describe("cycles_extend", () => {
  it("returns extend response", async () => {
    const handler = getRegisteredToolHandler("cycles_extend");
    const result = await handler({
      reservationId: "rsv_123",
      idempotencyKey: "k1",
      extendByMs: 60000,
    });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.status).toBe("ACTIVE");
    expect(body.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("returns error on expired reservation", async () => {
    vi.spyOn(adapter, "extendReservation").mockRejectedValue(
      new CyclesApiError("RESERVATION_EXPIRED", "Expired", "req-4", 410),
    );
    const handler = getRegisteredToolHandler("cycles_extend");
    const result = await handler({
      reservationId: "rsv_old",
      idempotencyKey: "k2",
      extendByMs: 30000,
    });
    expect(result.isError).toBe(true);
  });
});

describe("cycles_decide", () => {
  it("returns decision", async () => {
    const handler = getRegisteredToolHandler("cycles_decide");
    const result = await handler({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 500 },
    });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.decision).toBe("ALLOW");
  });

  it("returns error on invalid subject", async () => {
    const handler = getRegisteredToolHandler("cycles_decide");
    const result = await handler({
      idempotencyKey: "k2",
      subject: {},
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 500 },
    });
    expect(result.isError).toBe(true);
  });

  it("returns error on adapter failure", async () => {
    vi.spyOn(adapter, "decide").mockRejectedValue(
      new CyclesApiError("BUDGET_EXCEEDED", "Over budget", "req-d1", 409),
    );
    const handler = getRegisteredToolHandler("cycles_decide");
    const result = await handler({
      idempotencyKey: "k3",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 500 },
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("BUDGET_EXCEEDED");
  });
});

describe("cycles_check_balance", () => {
  it("returns balances", async () => {
    const handler = getRegisteredToolHandler("cycles_check_balance");
    const result = await handler({ tenant: "t1" });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.balances).toHaveLength(1);
  });

  it("returns error on no subject filter", async () => {
    const handler = getRegisteredToolHandler("cycles_check_balance");
    const result = await handler({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.message).toContain("subject filter");
  });

  it("passes includeChildren and pagination params", async () => {
    const spy = vi.spyOn(adapter, "getBalances");
    const handler = getRegisteredToolHandler("cycles_check_balance");
    await handler({
      tenant: "t1",
      includeChildren: true,
      limit: 10,
      cursor: "abc",
    });
    expect(spy).toHaveBeenCalledWith({
      tenant: "t1",
      include_children: "true",
      limit: "10",
      cursor: "abc",
    });
  });
});

describe("cycles_list_reservations", () => {
  it("returns reservation list", async () => {
    const handler = getRegisteredToolHandler("cycles_list_reservations");
    const result = await handler({});
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.reservations).toBeDefined();
  });

  it("passes status and subject filters", async () => {
    const spy = vi.spyOn(adapter, "listReservations");
    const handler = getRegisteredToolHandler("cycles_list_reservations");
    await handler({ status: "ACTIVE", tenant: "t1", limit: 25 });
    expect(spy).toHaveBeenCalledWith({
      status: "ACTIVE",
      tenant: "t1",
      limit: "25",
    });
  });

  it("converts idempotencyKey to snake_case query param", async () => {
    const spy = vi.spyOn(adapter, "listReservations");
    const handler = getRegisteredToolHandler("cycles_list_reservations");
    await handler({ idempotencyKey: "key-123", tenant: "t1" });
    expect(spy).toHaveBeenCalledWith({
      idempotency_key: "key-123",
      tenant: "t1",
    });
  });

  it("returns error on adapter failure", async () => {
    vi.spyOn(adapter, "listReservations").mockRejectedValue(
      new CyclesApiError("INTERNAL_ERROR", "Server error", "req-lr1", 500),
    );
    const handler = getRegisteredToolHandler("cycles_list_reservations");
    const result = await handler({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("INTERNAL_ERROR");
  });
});

describe("cycles_get_reservation", () => {
  it("returns reservation detail", async () => {
    const handler = getRegisteredToolHandler("cycles_get_reservation");
    const result = await handler({ reservationId: "rsv_abc" });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.reservationId).toBe("rsv_abc");
    expect(body.status).toBe("ACTIVE");
  });

  it("returns error on not found", async () => {
    vi.spyOn(adapter, "getReservation").mockRejectedValue(
      new CyclesApiError("NOT_FOUND", "Not found", "req-5", 404),
    );
    const handler = getRegisteredToolHandler("cycles_get_reservation");
    const result = await handler({ reservationId: "rsv_missing" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("NOT_FOUND");
  });
});

describe("cycles_create_event", () => {
  it("returns event response", async () => {
    const handler = getRegisteredToolHandler("cycles_create_event");
    const result = await handler({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      actual: { unit: "TOKENS", amount: 500 },
    });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.status).toBe("APPLIED");
    expect(body.eventId).toBeTruthy();
  });

  it("returns error on invalid subject", async () => {
    const handler = getRegisteredToolHandler("cycles_create_event");
    const result = await handler({
      idempotencyKey: "k2",
      subject: {},
      action: { kind: "llm.completion", name: "gpt-4o" },
      actual: { unit: "TOKENS", amount: 500 },
    });
    expect(result.isError).toBe(true);
  });

  it("returns error on adapter failure", async () => {
    vi.spyOn(adapter, "createEvent").mockRejectedValue(
      new CyclesApiError("BUDGET_EXCEEDED", "Over budget", "req-6", 409),
    );
    const handler = getRegisteredToolHandler("cycles_create_event");
    const result = await handler({
      idempotencyKey: "k3",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      actual: { unit: "TOKENS", amount: 500 },
    });
    expect(result.isError).toBe(true);
  });
});

describe("tool error handling", () => {
  it("handles non-CyclesApiError exceptions", async () => {
    vi.spyOn(adapter, "createReservation").mockRejectedValue(
      new Error("network timeout"),
    );
    const handler = getRegisteredToolHandler("cycles_reserve");
    const result = await handler({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm", name: "gpt" },
      estimate: { unit: "TOKENS", amount: 100 },
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("network timeout");
  });

  it("handles non-Error thrown values", async () => {
    vi.spyOn(adapter, "decide").mockRejectedValue("string error");
    const handler = getRegisteredToolHandler("cycles_decide");
    const result = await handler({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm", name: "gpt" },
      estimate: { unit: "TOKENS", amount: 100 },
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.message).toBe("string error");
  });
});

describe("tool metadata (titles, annotations, output schemas)", () => {
  const READ_ONLY = ["cycles_check_balance", "cycles_list_reservations", "cycles_get_reservation"];
  const WRITES = [
    "cycles_reserve",
    "cycles_commit",
    "cycles_release",
    "cycles_extend",
    "cycles_decide",
    "cycles_create_event",
  ];

  function getRegisteredTool(name: string): any {
    return (server as any)._registeredTools[name];
  }

  it("read-only tools carry readOnlyHint and closed-world hint", () => {
    for (const name of READ_ONLY) {
      const tool = getRegisteredTool(name);
      expect(tool.annotations, name).toEqual({ readOnlyHint: true, openWorldHint: false });
    }
  });

  it("mutating tools are marked idempotent and non-destructive", () => {
    for (const name of WRITES) {
      const tool = getRegisteredTool(name);
      expect(tool.annotations, name).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it("every tool has a title and an output schema", () => {
    for (const name of [...READ_ONLY, ...WRITES]) {
      const tool = getRegisteredTool(name);
      expect(tool.title, name).toBeTruthy();
      expect(tool.outputSchema, name).toBeDefined();
    }
  });
});

describe("structured output", () => {
  const VALID_PARAMS: Record<string, Record<string, unknown>> = {
    cycles_reserve: {
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
    },
    cycles_commit: {
      reservationId: "rsv_1",
      idempotencyKey: "k1",
      actual: { unit: "TOKENS", amount: 850 },
    },
    cycles_release: { reservationId: "rsv_1", idempotencyKey: "k1" },
    cycles_extend: { reservationId: "rsv_1", idempotencyKey: "k1", extendByMs: 60000 },
    cycles_decide: {
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
    },
    cycles_check_balance: { tenant: "t1" },
    cycles_list_reservations: {},
    cycles_get_reservation: { reservationId: "rsv_1" },
    cycles_create_event: {
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      actual: { unit: "TOKENS", amount: 500 },
    },
  };

  it("success results carry structuredContent matching the declared output schema", async () => {
    const { z } = await import("zod");
    for (const [name, params] of Object.entries(VALID_PARAMS)) {
      const tool = (server as any)._registeredTools[name];
      const result = await tool.handler(params);
      expect(result.isError, name).toBeUndefined();
      expect(result.structuredContent, name).toBeDefined();
      // structuredContent must validate against the tool's own output schema
      // (the SDK stores it as an already-constructed ZodObject; duck-type
      // rather than instanceof because the SDK may hold its own zod instance)
      const schema =
        typeof tool.outputSchema?.parse === "function"
          ? tool.outputSchema
          : z.object(tool.outputSchema);
      expect(() => schema.parse(result.structuredContent), name).not.toThrow();
      // text content mirrors structuredContent for clients that read text only
      expect(JSON.parse(result.content[0].text), name).toEqual(result.structuredContent);
    }
  });

  it("error results carry no structuredContent", async () => {
    const tool = (server as any)._registeredTools["cycles_reserve"];
    const result = await tool.handler({
      idempotencyKey: "k1",
      subject: {},
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe("agent ergonomics", () => {
  it("passes the idempotency key through unchanged", async () => {
    const spy = vi.spyOn(adapter, "commitReservation");
    const tool = (server as any)._registeredTools["cycles_commit"];
    await tool.handler({
      reservationId: "rsv_1",
      idempotencyKey: "explicit-key",
      actual: { unit: "TOKENS", amount: 10 },
    });
    expect(spy.mock.calls[0][1].idempotencyKey).toBe("explicit-key");
  });

  it("fills subject from CYCLES_DEFAULT_* env vars when omitted", async () => {
    vi.stubEnv("CYCLES_DEFAULT_TENANT", "env-tenant");
    vi.stubEnv("CYCLES_DEFAULT_APP", "env-app");
    try {
      const spy = vi.spyOn(adapter, "createReservation");
      const tool = (server as any)._registeredTools["cycles_reserve"];
      const result = await tool.handler({
        idempotencyKey: "k-env",
        action: { kind: "llm.completion", name: "gpt" },
        estimate: { unit: "TOKENS", amount: 100 },
      });
      expect(result.isError).toBeUndefined();
      expect(spy.mock.calls[0][0].subject).toEqual({ tenant: "env-tenant", app: "env-app" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("explicit subject fields win over env defaults", async () => {
    vi.stubEnv("CYCLES_DEFAULT_TENANT", "env-tenant");
    try {
      const spy = vi.spyOn(adapter, "decide");
      const tool = (server as any)._registeredTools["cycles_decide"];
      await tool.handler({
        idempotencyKey: "k-exp",
        subject: { tenant: "explicit-tenant" },
        action: { kind: "llm.completion", name: "gpt" },
        estimate: { unit: "TOKENS", amount: 100 },
      });
      expect(spy.mock.calls[0][0].subject.tenant).toBe("explicit-tenant");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("still rejects when no subject and no env defaults", async () => {
    const tool = (server as any)._registeredTools["cycles_reserve"];
    const result = await tool.handler({
      idempotencyKey: "k-nodef",
      action: { kind: "llm.completion", name: "gpt" },
      estimate: { unit: "TOKENS", amount: 100 },
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toContain("CYCLES_DEFAULT_");
  });

  it("rejects oversized env defaults with a named error", async () => {
    vi.stubEnv("CYCLES_DEFAULT_TENANT", "x".repeat(129));
    try {
      const tool = (server as any)._registeredTools["cycles_decide"];
      const result = await tool.handler({
        idempotencyKey: "k-big",
        action: { kind: "llm.completion", name: "gpt" },
        estimate: { unit: "TOKENS", amount: 100 },
      });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).message).toContain("CYCLES_DEFAULT_TENANT");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects whitespace-only env defaults", async () => {
    vi.stubEnv("CYCLES_DEFAULT_TENANT", "   ");
    try {
      const tool = (server as any)._registeredTools["cycles_check_balance"];
      const result = await tool.handler({});
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).message).toContain("CYCLES_DEFAULT_TENANT");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("cycles_check_balance works with only env-default filters", async () => {
    vi.stubEnv("CYCLES_DEFAULT_TENANT", "env-tenant");
    try {
      const tool = (server as any)._registeredTools["cycles_check_balance"];
      const result = await tool.handler({});
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent.balances).toBeDefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("budget-pressure hints", () => {
  it("appends a DENY hint as extra text content", async () => {
    vi.spyOn(adapter, "decide").mockResolvedValue({
      decision: "DENY" as any,
      reasonCode: "BUDGET_EXHAUSTED",
      affectedScopes: [],
    });
    const tool = (server as any)._registeredTools["cycles_decide"];
    const result = await tool.handler({
      idempotencyKey: "k-deny",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt" },
      estimate: { unit: "TOKENS", amount: 100 },
    });
    expect(result.content.length).toBe(2);
    expect(result.content[1].text).toContain("DENIED");
    // structuredContent stays pure — hints are text-only
    expect(result.structuredContent.decision).toBe("DENY");
    expect(JSON.stringify(result.structuredContent)).not.toContain("HINT");
  });

  it("appends a caps hint on ALLOW_WITH_CAPS", async () => {
    vi.spyOn(adapter, "decide").mockResolvedValue({
      decision: "ALLOW_WITH_CAPS" as any,
      caps: { maxTokens: 500 },
    });
    const tool = (server as any)._registeredTools["cycles_decide"];
    const result = await tool.handler({
      idempotencyKey: "k-caps",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt" },
      estimate: { unit: "TOKENS", amount: 100 },
    });
    expect(result.content[1].text).toContain("WITH CAPS");
  });

  it("appends a low-budget hint when remaining/allocated is under threshold", async () => {
    vi.spyOn(adapter, "getBalances").mockResolvedValue({
      balances: [
        {
          scope: "tenant:t1",
          scopePath: "tenant:t1",
          remaining: { unit: "TOKENS", amount: 100 },
          allocated: { unit: "TOKENS", amount: 1000 },
        },
      ],
    });
    const tool = (server as any)._registeredTools["cycles_check_balance"];
    const result = await tool.handler({ tenant: "t1" });
    expect(result.content.length).toBe(2);
    expect(result.content[1].text).toContain("low budget");
    expect(result.content[1].text).toContain("10%");
  });

  it("adds no hints on healthy ALLOW responses", async () => {
    const tool = (server as any)._registeredTools["cycles_reserve"];
    const result = await tool.handler({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt" },
      estimate: { unit: "TOKENS", amount: 100 },
    });
    // mock balances are 75% remaining — no hint expected
    expect(result.content.length).toBe(1);
  });
});
