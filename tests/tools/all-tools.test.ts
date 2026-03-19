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
