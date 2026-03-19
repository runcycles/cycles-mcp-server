import { describe, it, expect } from "vitest";
import {
  mockReservationCreateResponse,
  mockCommitResponse,
  mockReleaseResponse,
  mockExtendResponse,
  mockDecisionResponse,
  mockEventCreateResponse,
  mockBalanceResponse,
  mockReservationListResponse,
  mockReservationDetail,
} from "../src/mocks/mock-responses.js";

describe("mockReservationCreateResponse", () => {
  it("returns correct structure for live request", () => {
    const resp = mockReservationCreateResponse({
      idempotencyKey: "k1",
      subject: { tenant: "t1", workflow: "w1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 1000 },
    });
    expect(resp.decision).toBe("ALLOW");
    expect(resp.reservationId).toMatch(/^rsv_/);
    expect(resp.affectedScopes[0]).toBe("tenant:t1/workflow:w1");
    expect(resp.scopePath).toBe("tenant:t1/workflow:w1");
    expect(resp.reserved).toEqual({ unit: "TOKENS", amount: 1000 });
    expect(resp.expiresAtMs).toBeGreaterThan(Date.now() - 1000);
    expect(resp.balances).toHaveLength(1);
  });

  it("returns correct structure for dry run", () => {
    const resp = mockReservationCreateResponse({
      idempotencyKey: "k2",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "USD_MICROCENTS", amount: 500000 },
      dryRun: true,
    });
    expect(resp.decision).toBe("ALLOW");
    expect(resp.reservationId).toBeUndefined();
    expect(resp.expiresAtMs).toBeUndefined();
  });
});

describe("mockCommitResponse", () => {
  it("returns released when actual < 1000", () => {
    const resp = mockCommitResponse("rsv_1", {
      idempotencyKey: "k1",
      actual: { unit: "TOKENS", amount: 500 },
    });
    expect(resp.status).toBe("COMMITTED");
    expect(resp.charged).toEqual({ unit: "TOKENS", amount: 500 });
    expect(resp.released).toEqual({ unit: "TOKENS", amount: 500 });
  });

  it("returns no released when actual >= 1000", () => {
    const resp = mockCommitResponse("rsv_2", {
      idempotencyKey: "k2",
      actual: { unit: "TOKENS", amount: 1500 },
    });
    expect(resp.released).toBeUndefined();
  });
});

describe("mockReleaseResponse", () => {
  it("returns correct structure", () => {
    const resp = mockReleaseResponse("rsv_1");
    expect(resp.status).toBe("RELEASED");
    expect(resp.released.amount).toBe(1000);
  });
});

describe("mockExtendResponse", () => {
  it("returns correct expiry", () => {
    const resp = mockExtendResponse("rsv_1", {
      idempotencyKey: "k1",
      extendByMs: 30000,
    });
    expect(resp.status).toBe("ACTIVE");
    expect(resp.expiresAtMs).toBeGreaterThan(Date.now() + 29000);
  });
});

describe("mockDecisionResponse", () => {
  it("returns ALLOW with scopes", () => {
    const resp = mockDecisionResponse({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 500 },
    });
    expect(resp.decision).toBe("ALLOW");
    expect(resp.affectedScopes).toContain("tenant:t1");
  });
});

describe("mockEventCreateResponse", () => {
  it("returns APPLIED with eventId", () => {
    const resp = mockEventCreateResponse({
      idempotencyKey: "k1",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      actual: { unit: "TOKENS", amount: 500 },
    });
    expect(resp.status).toBe("APPLIED");
    expect(resp.eventId).toMatch(/^evt_/);
  });
});

describe("mockBalanceResponse", () => {
  it("returns balance for tenant", () => {
    const resp = mockBalanceResponse({ tenant: "acme" });
    expect(resp.balances).toHaveLength(1);
    expect(resp.balances[0].scope).toBe("tenant:acme");
    expect(resp.balances[0].remaining.amount).toBe(750_000);
    expect(resp.balances[0].allocated?.amount).toBe(1_000_000);
    expect(resp.balances[0].isOverLimit).toBe(false);
  });

  it("uses workflow as fallback scope", () => {
    const resp = mockBalanceResponse({ workflow: "w1" });
    expect(resp.balances[0].scope).toBe("tenant:w1");
  });

  it("uses default when no filter provided", () => {
    const resp = mockBalanceResponse({});
    expect(resp.balances[0].scope).toBe("tenant:default");
  });
});

describe("mockReservationListResponse", () => {
  it("returns one active reservation", () => {
    const resp = mockReservationListResponse();
    expect(resp.reservations).toHaveLength(1);
    expect(resp.reservations[0].status).toBe("ACTIVE");
    expect(resp.reservations[0].reservationId).toMatch(/^rsv_/);
  });
});

describe("mockReservationDetail", () => {
  it("returns detail with given id", () => {
    const resp = mockReservationDetail("rsv_custom");
    expect(resp.reservationId).toBe("rsv_custom");
    expect(resp.status).toBe("ACTIVE");
    expect(resp.subject.tenant).toBe("mock-tenant");
  });
});
