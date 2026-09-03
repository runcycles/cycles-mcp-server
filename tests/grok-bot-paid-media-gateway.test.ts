import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayError,
  applyCampaignDailyBudget,
  createGrokBotPaidMediaServer,
  estimateCampaignRiskPoints,
  type CyclesAuthority,
  type GatewayConfig,
  type GatewayDependencies,
  type PaidMediaClient,
} from "../examples/grok-bot-paid-media-gateway/gateway.js";

const config: GatewayConfig = {
  tenant: "acme",
  memberScope: "alice-paid-media",
  workflow: "nightly-campaign-review",
  paidMediaAccountId: "ads-acme",
  maxDailyBudgetUsd: 5_000,
};

const input = {
  operationId: "campaign-change-MKT-1042",
  campaignId: "cmp_search_us",
  proposedDailyBudgetUsd: 950,
  changeTicket: "MKT-1042",
};

let authority: CyclesAuthority;
let paidMedia: PaidMediaClient;
let auditRecords: Array<Record<string, unknown>>;
let dependencies: GatewayDependencies;

beforeEach(() => {
  authority = {
    reserve: vi.fn().mockResolvedValue({
      allowed: true,
      decision: "ALLOW",
      reservationId: "rsv_123",
      requestId: "cycles-reserve-1",
    }),
    commit: vi.fn().mockResolvedValue({ requestId: "cycles-commit-1" }),
    release: vi.fn().mockResolvedValue({ requestId: "cycles-release-1" }),
  };
  paidMedia = {
    readDailyBudget: vi.fn().mockResolvedValue({
      currentDailyBudgetUsd: 800,
      providerRequestId: "provider-read-1",
    }),
    applyDailyBudget: vi
      .fn()
      .mockResolvedValue({ providerRequestId: "provider-1" }),
  };
  auditRecords = [];
  dependencies = {
    authority,
    paidMedia,
    audit: { record: (record) => auditRecords.push(record) },
  };
});

describe("estimateCampaignRiskPoints", () => {
  it("uses a base charge, scales by the absolute delta, and caps exposure", () => {
    expect(estimateCampaignRiskPoints(100, 100)).toBe(25);
    expect(estimateCampaignRiskPoints(800, 950)).toBe(35);
    expect(estimateCampaignRiskPoints(100_000, 1)).toBe(500);
  });

  it.each([
    [-1, 10],
    [0, 0],
    [Number.NaN, 10],
    [0, Number.POSITIVE_INFINITY],
  ])("rejects invalid budget pair %s -> %s", (current, proposed) => {
    expect(() => estimateCampaignRiskPoints(current, proposed)).toThrow(
      GatewayError,
    );
  });
});

describe("applyCampaignDailyBudget", () => {
  it("reserves against trusted scope, dispatches, and commits correlated exposure", async () => {
    const result = await applyCampaignDailyBudget(dependencies, config, input);

    expect(result).toEqual({
      status: "APPLIED",
      operationId: input.operationId,
      campaignId: input.campaignId,
      previousDailyBudgetUsd: 800,
      newDailyBudgetUsd: 950,
      riskPoints: 35,
      reservationId: "rsv_123",
      providerRequestId: "provider-1",
    });
    expect(authority.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `grok-paid-media:${input.operationId}:reserve`,
        subject: {
          tenant: "acme",
          workspace: "alice-paid-media",
          app: "grok-bot",
          workflow: "nightly-campaign-review",
          agent: "member-shared",
          toolset: "paid-media",
        },
        estimate: { unit: "RISK_POINTS", amount: 35 },
      }),
    );
    expect(paidMedia.applyDailyBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: input.operationId,
        accountId: "ads-acme",
        expectedCurrentDailyBudgetUsd: 800,
        cyclesReservationId: "rsv_123",
      }),
    );
    expect(authority.commit).toHaveBeenCalledWith(
      "rsv_123",
      expect.objectContaining({
        idempotencyKey: `grok-paid-media:${input.operationId}:commit`,
        actual: { unit: "RISK_POINTS", amount: 35 },
      }),
    );
    expect(authority.release).not.toHaveBeenCalled();
    expect(auditRecords.map((record) => record.event)).toEqual([
      "cycles.reserved",
      "campaign.dispatching",
      "cycles.committed",
    ]);
  });

  it("uses a verified Bot scope only when configured by trusted infrastructure", async () => {
    await applyCampaignDailyBudget(
      dependencies,
      { ...config, verifiedBotScope: "paid-media-bot-7" },
      input,
    );
    expect(authority.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ agent: "paid-media-bot-7" }),
      }),
    );
  });

  it("blocks application-policy violations before reserving", async () => {
    await expect(
      applyCampaignDailyBudget(dependencies, config, {
        ...input,
        proposedDailyBudgetUsd: 5_001,
      }),
    ).rejects.toMatchObject({ code: "APPLICATION_POLICY_DENIED" });
    expect(authority.reserve).not.toHaveBeenCalled();
    expect(paidMedia.applyDailyBudget).not.toHaveBeenCalled();
    expect(paidMedia.readDailyBudget).not.toHaveBeenCalled();
  });

  it("fails closed when the authoritative current budget cannot be read", async () => {
    vi.mocked(paidMedia.readDailyBudget).mockRejectedValue(
      new Error("provider unavailable"),
    );
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({ code: "CURRENT_BUDGET_UNAVAILABLE" });
    expect(authority.reserve).not.toHaveBeenCalled();
    expect(paidMedia.applyDailyBudget).not.toHaveBeenCalled();
    expect(auditRecords[0]).toMatchObject({
      event: "campaign.read_failed",
      error: "provider unavailable",
    });
  });

  it("blocks malformed tool input before reserving", async () => {
    await expect(
      applyCampaignDailyBudget(dependencies, config, {
        ...input,
        operationId: "bad id",
      }),
    ).rejects.toThrow();
    expect(authority.reserve).not.toHaveBeenCalled();
  });

  it("fails closed when Cycles is unavailable", async () => {
    vi.mocked(authority.reserve).mockRejectedValue(new Error("timeout"));
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({ code: "CYCLES_UNAVAILABLE" });
    expect(paidMedia.applyDailyBudget).not.toHaveBeenCalled();
    expect(auditRecords[0]).toMatchObject({
      event: "cycles.reserve_failed",
      error: "timeout",
    });
  });

  it("stops on a Cycles denial", async () => {
    vi.mocked(authority.reserve).mockResolvedValue({
      allowed: false,
      reason: "risk budget exhausted",
      requestId: "cycles-deny-1",
    });
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({
      code: "CYCLES_DENIED",
      message: "risk budget exhausted",
    });
    expect(paidMedia.applyDailyBudget).not.toHaveBeenCalled();
    expect(auditRecords[0]).toMatchObject({
      event: "cycles.denied",
      cycles_request_id: "cycles-deny-1",
    });
  });

  it("uses a default message for a Cycles denial without a reason", async () => {
    vi.mocked(authority.reserve).mockResolvedValue({ allowed: false });
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({ code: "CYCLES_DENIED" });
  });

  it("rejects an allowed response without a reservation ID", async () => {
    vi.mocked(authority.reserve).mockResolvedValue({
      allowed: true,
      decision: "ALLOW",
    });
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({ code: "INVALID_CYCLES_RESPONSE" });
    expect(paidMedia.applyDailyBudget).not.toHaveBeenCalled();
  });

  it("releases when cancellation occurs before downstream dispatch", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      applyCampaignDailyBudget(dependencies, config, input, controller.signal),
    ).rejects.toMatchObject({ code: "CANCELLED_BEFORE_DISPATCH" });
    expect(authority.release).toHaveBeenCalledWith("rsv_123", {
      idempotencyKey: `grok-paid-media:${input.operationId}:release`,
      reason: "mcp_call_cancelled_before_dispatch",
    });
    expect(paidMedia.applyDailyBudget).not.toHaveBeenCalled();
    expect(auditRecords.at(-1)).toMatchObject({ event: "cycles.released" });
  });

  it("reports a pending settlement when cancellation release fails", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(authority.release).mockRejectedValue(new Error("release timeout"));
    await expect(
      applyCampaignDailyBudget(dependencies, config, input, controller.signal),
    ).rejects.toMatchObject({ code: "SETTLEMENT_PENDING" });
    expect(auditRecords.at(-1)).toMatchObject({
      event: "cycles.settlement_pending",
      intended_settlement: "release",
    });
  });

  it("commits exposure when the downstream outcome is unknown", async () => {
    vi.mocked(paidMedia.applyDailyBudget).mockRejectedValue(
      new Error("provider timeout"),
    );
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({ code: "DOWNSTREAM_OUTCOME_UNKNOWN" });
    expect(authority.commit).toHaveBeenCalledWith(
      "rsv_123",
      expect.objectContaining({
        actual: { unit: "RISK_POINTS", amount: 35 },
        metadata: expect.objectContaining({ outcome: "downstream_unknown" }),
      }),
    );
    expect(authority.release).not.toHaveBeenCalled();
    expect(auditRecords.at(-1)).toMatchObject({
      event: "campaign.outcome_unknown",
    });
  });

  it("reports pending settlement when downstream and commit both fail", async () => {
    vi.mocked(paidMedia.applyDailyBudget).mockRejectedValue("provider timeout");
    vi.mocked(authority.commit).mockRejectedValue(new Error("commit timeout"));
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({ code: "SETTLEMENT_PENDING" });
    expect(auditRecords.at(-1)).toMatchObject({
      event: "cycles.settlement_pending",
      downstream_error: "provider timeout",
      settlement_error: "commit timeout",
    });
  });

  it("reports pending settlement after an applied action if commit fails", async () => {
    vi.mocked(authority.commit).mockRejectedValue(new Error("commit timeout"));
    await expect(
      applyCampaignDailyBudget(dependencies, config, input),
    ).rejects.toMatchObject({
      code: "SETTLEMENT_PENDING",
      details: {
        reservationId: "rsv_123",
        providerRequestId: "provider-1",
      },
    });
    expect(auditRecords.at(-1)).toMatchObject({
      event: "cycles.settlement_pending",
      provider_request_id: "provider-1",
    });
  });
});

describe("MCP tool", () => {
  function toolHandler(server: ReturnType<typeof createGrokBotPaidMediaServer>) {
    return (server as unknown as {
      _registeredTools: Record<string, { handler: Function }>;
    })._registeredTools.apply_campaign_daily_budget.handler;
  }

  it("returns structured success from the mandatory gateway", async () => {
    const server = createGrokBotPaidMediaServer(dependencies, config);
    const result = await toolHandler(server)(input, {
      signal: new AbortController().signal,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ status: "APPLIED" });
  });

  it("returns a bounded MCP error without dispatching on denial", async () => {
    vi.mocked(authority.reserve).mockResolvedValue({
      allowed: false,
      reason: "denied",
    });
    const server = createGrokBotPaidMediaServer(dependencies, config);
    const result = await toolHandler(server)(input, {
      signal: new AbortController().signal,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      error: "CYCLES_DENIED",
    });
    expect(paidMedia.applyDailyBudget).not.toHaveBeenCalled();
  });

  it("normalizes unexpected errors into an internal MCP error", async () => {
    vi.mocked(authority.reserve).mockRejectedValue("socket closed");
    const server = createGrokBotPaidMediaServer(dependencies, config);
    const result = await toolHandler(server)(input, {
      signal: new AbortController().signal,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      error: "CYCLES_UNAVAILABLE",
    });
  });
});
