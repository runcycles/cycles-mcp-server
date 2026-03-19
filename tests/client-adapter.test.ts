import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MockClientAdapter,
  RealClientAdapter,
  CyclesApiError,
  createAdapter,
} from "../src/client-adapter.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(status: number, body: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      statusText: status >= 400 ? "Error" : "OK",
      json: () => Promise.resolve(body),
      headers: { get: () => null },
    }),
  );
}

function createTestAdapter(): RealClientAdapter {
  return new RealClientAdapter(
    // @ts-expect-error - minimal config for test
    {
      baseUrl: "http://localhost:7878",
      apiKey: "test-key",
      connectTimeout: 1000,
      readTimeout: 1000,
    },
  );
}

const subject = { tenant: "t1" };
const action = { kind: "llm.completion", name: "gpt-4o" };
const amount = { unit: "TOKENS", amount: 1000 };

describe("MockClientAdapter", () => {
  const adapter = new MockClientAdapter();

  it("createReservation returns ALLOW with reservationId", async () => {
    const resp = await adapter.createReservation({
      idempotencyKey: "k1",
      subject,
      action,
      estimate: amount,
    });
    expect(resp.decision).toBe("ALLOW");
    expect(resp.reservationId).toBeTruthy();
    expect(resp.affectedScopes).toContain("tenant:t1");
  });

  it("createReservation dry run has no reservationId", async () => {
    const resp = await adapter.createReservation({
      idempotencyKey: "k2",
      subject,
      action,
      estimate: amount,
      dryRun: true,
    });
    expect(resp.decision).toBe("ALLOW");
    expect(resp.reservationId).toBeUndefined();
  });

  it("commitReservation returns COMMITTED", async () => {
    const resp = await adapter.commitReservation("rsv_123", {
      idempotencyKey: "k3",
      actual: { unit: "TOKENS", amount: 500 },
    });
    expect(resp.status).toBe("COMMITTED");
    expect(resp.charged.amount).toBe(500);
    expect(resp.released).toBeDefined();
  });

  it("commitReservation with large actual has no released", async () => {
    const resp = await adapter.commitReservation("rsv_123", {
      idempotencyKey: "k4",
      actual: { unit: "TOKENS", amount: 2000 },
    });
    expect(resp.released).toBeUndefined();
  });

  it("releaseReservation returns RELEASED", async () => {
    const resp = await adapter.releaseReservation("rsv_123", {
      idempotencyKey: "k5",
    });
    expect(resp.status).toBe("RELEASED");
    expect(resp.released.amount).toBeGreaterThan(0);
  });

  it("extendReservation returns ACTIVE with new expiry", async () => {
    const resp = await adapter.extendReservation("rsv_123", {
      idempotencyKey: "k6",
      extendByMs: 30000,
    });
    expect(resp.status).toBe("ACTIVE");
    expect(resp.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("decide returns ALLOW", async () => {
    const resp = await adapter.decide({
      idempotencyKey: "k7",
      subject,
      action,
      estimate: amount,
    });
    expect(resp.decision).toBe("ALLOW");
  });

  it("getBalances returns balances array", async () => {
    const resp = await adapter.getBalances({ tenant: "t1" });
    expect(resp.balances).toHaveLength(1);
    expect(resp.hasMore).toBe(false);
  });

  it("listReservations returns reservations array", async () => {
    const resp = await adapter.listReservations();
    expect(resp.reservations).toHaveLength(1);
    expect(resp.hasMore).toBe(false);
  });

  it("getReservation returns detail", async () => {
    const resp = await adapter.getReservation("rsv_abc");
    expect(resp.reservationId).toBe("rsv_abc");
    expect(resp.status).toBe("ACTIVE");
  });

  it("createEvent returns APPLIED with eventId", async () => {
    const resp = await adapter.createEvent({
      idempotencyKey: "k8",
      subject,
      action,
      actual: amount,
    });
    expect(resp.status).toBe("APPLIED");
    expect(resp.eventId).toBeTruthy();
  });
});

describe("RealClientAdapter - success paths", () => {
  it("createReservation maps response correctly", async () => {
    stubFetch(200, {
      decision: "ALLOW",
      reservation_id: "rsv_test",
      affected_scopes: ["tenant:t1"],
      expires_at_ms: Date.now() + 60000,
      scope_path: "tenant:t1",
      reserved: { unit: "TOKENS", amount: 1000 },
    });
    const adapter = createTestAdapter();
    const resp = await adapter.createReservation({
      idempotencyKey: "k1",
      subject,
      action,
      estimate: amount,
    });
    expect(resp.decision).toBe("ALLOW");
    expect(resp.reservationId).toBe("rsv_test");
    expect(resp.affectedScopes).toEqual(["tenant:t1"]);
  });

  it("commitReservation maps response correctly", async () => {
    stubFetch(200, {
      status: "COMMITTED",
      charged: { unit: "TOKENS", amount: 800 },
      released: { unit: "TOKENS", amount: 200 },
    });
    const adapter = createTestAdapter();
    const resp = await adapter.commitReservation("rsv_1", {
      idempotencyKey: "k1",
      actual: { unit: "TOKENS", amount: 800 },
    });
    expect(resp.status).toBe("COMMITTED");
    expect(resp.charged.amount).toBe(800);
    expect(resp.released?.amount).toBe(200);
  });

  it("releaseReservation maps response correctly", async () => {
    stubFetch(200, {
      status: "RELEASED",
      released: { unit: "TOKENS", amount: 1000 },
    });
    const adapter = createTestAdapter();
    const resp = await adapter.releaseReservation("rsv_1", {
      idempotencyKey: "k1",
    });
    expect(resp.status).toBe("RELEASED");
    expect(resp.released.amount).toBe(1000);
  });

  it("extendReservation maps response correctly", async () => {
    const expiry = Date.now() + 120000;
    stubFetch(200, {
      status: "ACTIVE",
      expires_at_ms: expiry,
    });
    const adapter = createTestAdapter();
    const resp = await adapter.extendReservation("rsv_1", {
      idempotencyKey: "k1",
      extendByMs: 60000,
    });
    expect(resp.status).toBe("ACTIVE");
    expect(resp.expiresAtMs).toBe(expiry);
  });

  it("decide maps response correctly", async () => {
    stubFetch(200, {
      decision: "ALLOW",
      affected_scopes: ["tenant:t1"],
    });
    const adapter = createTestAdapter();
    const resp = await adapter.decide({
      idempotencyKey: "k1",
      subject,
      action,
      estimate: amount,
    });
    expect(resp.decision).toBe("ALLOW");
  });

  it("getBalances maps response correctly", async () => {
    stubFetch(200, {
      balances: [
        {
          scope: "tenant:t1",
          scope_path: "tenant:t1",
          remaining: { unit: "TOKENS", amount: 5000 },
        },
      ],
      has_more: false,
    });
    const adapter = createTestAdapter();
    const resp = await adapter.getBalances({ tenant: "t1" });
    expect(resp.balances).toHaveLength(1);
    expect(resp.balances[0].remaining.amount).toBe(5000);
  });

  it("listReservations maps response correctly", async () => {
    stubFetch(200, {
      reservations: [
        {
          reservation_id: "rsv_1",
          status: "ACTIVE",
          subject: { tenant: "t1" },
          action: { kind: "llm", name: "gpt" },
          reserved: { unit: "TOKENS", amount: 500 },
          created_at_ms: Date.now(),
          expires_at_ms: Date.now() + 60000,
          scope_path: "tenant:t1",
          affected_scopes: ["tenant:t1"],
        },
      ],
      has_more: false,
    });
    const adapter = createTestAdapter();
    const resp = await adapter.listReservations({ status: "ACTIVE" });
    expect(resp.reservations).toHaveLength(1);
    expect(resp.reservations[0].reservationId).toBe("rsv_1");
  });

  it("getReservation maps response correctly", async () => {
    stubFetch(200, {
      reservation_id: "rsv_x",
      status: "ACTIVE",
      subject: { tenant: "t1" },
      action: { kind: "llm", name: "gpt" },
      reserved: { unit: "TOKENS", amount: 500 },
      created_at_ms: Date.now(),
      expires_at_ms: Date.now() + 60000,
      scope_path: "tenant:t1",
      affected_scopes: ["tenant:t1"],
    });
    const adapter = createTestAdapter();
    const resp = await adapter.getReservation("rsv_x");
    expect(resp.reservationId).toBe("rsv_x");
  });

  it("createEvent maps response correctly", async () => {
    stubFetch(201, {
      status: "APPLIED",
      event_id: "evt_test",
    });
    const adapter = createTestAdapter();
    const resp = await adapter.createEvent({
      idempotencyKey: "k1",
      subject,
      action,
      actual: amount,
    });
    expect(resp.status).toBe("APPLIED");
    expect(resp.eventId).toBe("evt_test");
  });
});

describe("RealClientAdapter - error paths", () => {
  it("throws CyclesApiError on protocol error", async () => {
    stubFetch(409, {
      error: "BUDGET_EXCEEDED",
      message: "Insufficient budget",
      request_id: "req-abc",
    });
    const adapter = createTestAdapter();
    try {
      await adapter.createReservation({
        idempotencyKey: "k1",
        subject,
        action,
        estimate: amount,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CyclesApiError);
      const apiErr = err as CyclesApiError;
      expect(apiErr.errorCode).toBe("BUDGET_EXCEEDED");
      expect(apiErr.message).toBe("Insufficient budget");
      expect(apiErr.requestId).toBe("req-abc");
      expect(apiErr.httpStatus).toBe(409);
    }
  });

  it("throws with UNKNOWN on malformed error body", async () => {
    stubFetch(500, { foo: "bar" });
    const adapter = createTestAdapter();
    try {
      await adapter.decide({
        idempotencyKey: "k1",
        subject,
        action,
        estimate: amount,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CyclesApiError);
      expect((err as CyclesApiError).errorCode).toBe("UNKNOWN");
    }
  });

  it("throws on error with body.message fallback", async () => {
    stubFetch(502, { message: "Bad Gateway" });
    const adapter = createTestAdapter();
    try {
      await adapter.getBalances({ tenant: "t1" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CyclesApiError);
      expect((err as CyclesApiError).message).toBe("Bad Gateway");
    }
  });
});

describe("CyclesApiError", () => {
  it("has correct properties", () => {
    const err = new CyclesApiError(
      "BUDGET_EXCEEDED",
      "No budget",
      "req-1",
      409,
      { scope: "t1" },
    );
    expect(err.errorCode).toBe("BUDGET_EXCEEDED");
    expect(err.message).toBe("No budget");
    expect(err.requestId).toBe("req-1");
    expect(err.httpStatus).toBe(409);
    expect(err.details).toEqual({ scope: "t1" });
    expect(err.name).toBe("CyclesApiError");
  });
});

describe("createAdapter", () => {
  it("returns MockClientAdapter when CYCLES_MOCK=true", () => {
    const orig = process.env.CYCLES_MOCK;
    process.env.CYCLES_MOCK = "true";
    try {
      const adapter = createAdapter();
      expect(adapter).toBeInstanceOf(MockClientAdapter);
    } finally {
      if (orig === undefined) delete process.env.CYCLES_MOCK;
      else process.env.CYCLES_MOCK = orig;
    }
  });
});
