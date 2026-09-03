import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const CampaignBudgetChangeSchema = z.object({
  operationId: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
  campaignId: z.string().trim().min(1).max(128),
  proposedDailyBudgetUsd: z.number().finite().positive(),
  changeTicket: z.string().trim().min(1).max(128),
});

export type CampaignBudgetChange = z.infer<typeof CampaignBudgetChangeSchema>;

export interface GatewayConfig {
  tenant: string;
  memberScope: string;
  workflow: string;
  paidMediaAccountId: string;
  maxDailyBudgetUsd: number;
  verifiedBotScope?: string;
}

export interface AuthorityReservation {
  allowed: boolean;
  decision?: "ALLOW" | "ALLOW_WITH_CAPS";
  reservationId?: string;
  requestId?: string;
  reason?: string;
}

export interface CyclesAuthority {
  reserve(request: {
    idempotencyKey: string;
    subject: Record<string, string>;
    action: { kind: string; name: string; tags: string[] };
    estimate: { unit: "RISK_POINTS"; amount: number };
    metadata: Record<string, unknown>;
  }): Promise<AuthorityReservation>;
  commit(
    reservationId: string,
    request: {
      idempotencyKey: string;
      actual: { unit: "RISK_POINTS"; amount: number };
      metadata: Record<string, unknown>;
    },
  ): Promise<{ requestId?: string }>;
  release(
    reservationId: string,
    request: { idempotencyKey: string; reason: string },
  ): Promise<{ requestId?: string }>;
}

export interface PaidMediaClient {
  readDailyBudget(request: {
    accountId: string;
    campaignId: string;
  }): Promise<{ currentDailyBudgetUsd: number; providerRequestId?: string }>;
  applyDailyBudget(request: {
    operationId: string;
    accountId: string;
    campaignId: string;
    expectedCurrentDailyBudgetUsd: number;
    proposedDailyBudgetUsd: number;
    changeTicket: string;
    cyclesReservationId: string;
  }): Promise<{ providerRequestId: string }>;
}

export interface AuditSink {
  record(record: Record<string, unknown>): void;
}

export interface GatewayDependencies {
  authority: CyclesAuthority;
  paidMedia: PaidMediaClient;
  audit: AuditSink;
}

export interface AppliedCampaignBudgetChange {
  status: "APPLIED";
  operationId: string;
  campaignId: string;
  previousDailyBudgetUsd: number;
  newDailyBudgetUsd: number;
  riskPoints: number;
  reservationId: string;
  providerRequestId: string;
}

export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function estimateCampaignRiskPoints(
  currentDailyBudgetUsd: number,
  proposedDailyBudgetUsd: number,
): number {
  if (
    !Number.isFinite(currentDailyBudgetUsd) ||
    currentDailyBudgetUsd < 0 ||
    !Number.isFinite(proposedDailyBudgetUsd) ||
    proposedDailyBudgetUsd <= 0
  ) {
    throw new GatewayError(
      "INVALID_BUDGET",
      "Campaign budgets must be finite; current must be non-negative and proposed must be positive.",
    );
  }

  const deltaUsd = Math.abs(proposedDailyBudgetUsd - currentDailyBudgetUsd);
  const variablePoints = Math.ceil(deltaUsd / 100) * 5;
  return Math.min(500, 25 + variablePoints);
}

function subjectFor(config: GatewayConfig): Record<string, string> {
  return {
    tenant: config.tenant,
    workspace: config.memberScope,
    app: "grok-bot",
    workflow: config.workflow,
    agent: config.verifiedBotScope ?? "member-shared",
    toolset: "paid-media",
  };
}

function auditBase(
  config: GatewayConfig,
  input: CampaignBudgetChange,
): Record<string, unknown> {
  return {
    operation_id: input.operationId,
    tenant: config.tenant,
    member_scope: config.memberScope,
    bot_scope: config.verifiedBotScope ?? "member-shared",
    workflow: config.workflow,
    account_id: config.paidMediaAccountId,
    campaign_id: input.campaignId,
    change_ticket: input.changeTicket,
  };
}

export async function applyCampaignDailyBudget(
  dependencies: GatewayDependencies,
  config: GatewayConfig,
  rawInput: CampaignBudgetChange,
  signal?: AbortSignal,
): Promise<AppliedCampaignBudgetChange> {
  const input = CampaignBudgetChangeSchema.parse(rawInput);
  if (input.proposedDailyBudgetUsd > config.maxDailyBudgetUsd) {
    throw new GatewayError(
      "APPLICATION_POLICY_DENIED",
      `Proposed daily budget exceeds the configured maximum of $${config.maxDailyBudgetUsd}.`,
    );
  }

  let currentDailyBudgetUsd: number;
  try {
    const current = await dependencies.paidMedia.readDailyBudget({
      accountId: config.paidMediaAccountId,
      campaignId: input.campaignId,
    });
    currentDailyBudgetUsd = current.currentDailyBudgetUsd;
  } catch (error) {
    dependencies.audit.record({
      event: "campaign.read_failed",
      ...auditBase(config, input),
      error: messageOf(error),
    });
    throw new GatewayError(
      "CURRENT_BUDGET_UNAVAILABLE",
      "The gateway could not read the authoritative current campaign budget; no change was dispatched.",
    );
  }

  const riskPoints = estimateCampaignRiskPoints(
    currentDailyBudgetUsd,
    input.proposedDailyBudgetUsd,
  );
  const keyPrefix = `grok-paid-media:${input.operationId}`;
  const base = auditBase(config, input);

  let reservation: AuthorityReservation;
  try {
    reservation = await dependencies.authority.reserve({
      idempotencyKey: `${keyPrefix}:reserve`,
      subject: subjectFor(config),
      action: {
        kind: "tool.paid_media",
        name: "apply_campaign_daily_budget",
        tags: ["external-write", "requires-approval"],
      },
      estimate: { unit: "RISK_POINTS", amount: riskPoints },
      metadata: {
        operation_id: input.operationId,
        account_id: config.paidMediaAccountId,
        campaign_id: input.campaignId,
        change_ticket: input.changeTicket,
      },
    });
  } catch (error) {
    dependencies.audit.record({
      event: "cycles.reserve_failed",
      ...base,
      error: messageOf(error),
    });
    throw new GatewayError(
      "CYCLES_UNAVAILABLE",
      "Cycles could not issue runtime authority; the campaign change was not dispatched.",
    );
  }

  if (!reservation.allowed) {
    dependencies.audit.record({
      event: "cycles.denied",
      ...base,
      cycles_request_id: reservation.requestId,
      reason: reservation.reason,
      risk_points: riskPoints,
    });
    throw new GatewayError(
      "CYCLES_DENIED",
      reservation.reason ?? "The campaign change exceeded its runtime-authority budget.",
      { cyclesRequestId: reservation.requestId },
    );
  }

  if (!reservation.reservationId) {
    throw new GatewayError(
      "INVALID_CYCLES_RESPONSE",
      "Cycles allowed the action without returning a reservation ID; the campaign change was not dispatched.",
    );
  }

  const reservationId = reservation.reservationId;
  dependencies.audit.record({
    event: "cycles.reserved",
    ...base,
    cycles_request_id: reservation.requestId,
    cycles_reservation_id: reservationId,
    decision: reservation.decision,
    risk_points: riskPoints,
  });

  if (signal?.aborted) {
    try {
      const released = await dependencies.authority.release(reservationId, {
        idempotencyKey: `${keyPrefix}:release`,
        reason: "mcp_call_cancelled_before_dispatch",
      });
      dependencies.audit.record({
        event: "cycles.released",
        ...base,
        cycles_request_id: released.requestId,
        cycles_reservation_id: reservationId,
      });
    } catch (error) {
      dependencies.audit.record({
        event: "cycles.settlement_pending",
        ...base,
        cycles_reservation_id: reservationId,
        intended_settlement: "release",
        error: messageOf(error),
      });
      throw new GatewayError(
        "SETTLEMENT_PENDING",
        "The action was cancelled before dispatch, but its reservation could not be released.",
        { reservationId },
      );
    }
    throw new GatewayError(
      "CANCELLED_BEFORE_DISPATCH",
      "The MCP call was cancelled before the campaign change was dispatched.",
      { reservationId },
    );
  }

  let providerResult: { providerRequestId: string };
  try {
    dependencies.audit.record({
      event: "campaign.dispatching",
      ...base,
      cycles_reservation_id: reservationId,
      risk_points: riskPoints,
    });
    providerResult = await dependencies.paidMedia.applyDailyBudget({
      operationId: input.operationId,
      accountId: config.paidMediaAccountId,
      campaignId: input.campaignId,
      expectedCurrentDailyBudgetUsd: currentDailyBudgetUsd,
      proposedDailyBudgetUsd: input.proposedDailyBudgetUsd,
      changeTicket: input.changeTicket,
      cyclesReservationId: reservationId,
    });
  } catch (downstreamError) {
    try {
      await dependencies.authority.commit(reservationId, {
        idempotencyKey: `${keyPrefix}:commit`,
        actual: { unit: "RISK_POINTS", amount: riskPoints },
        metadata: {
          outcome: "downstream_unknown",
          operation_id: input.operationId,
          error: messageOf(downstreamError),
        },
      });
    } catch (settlementError) {
      dependencies.audit.record({
        event: "cycles.settlement_pending",
        ...base,
        cycles_reservation_id: reservationId,
        intended_settlement: "commit",
        downstream_error: messageOf(downstreamError),
        settlement_error: messageOf(settlementError),
      });
      throw new GatewayError(
        "SETTLEMENT_PENDING",
        "The downstream outcome is unknown and the Cycles commit is pending; retry only with the same operation ID.",
        { reservationId },
      );
    }

    dependencies.audit.record({
      event: "campaign.outcome_unknown",
      ...base,
      cycles_reservation_id: reservationId,
      error: messageOf(downstreamError),
    });
    throw new GatewayError(
      "DOWNSTREAM_OUTCOME_UNKNOWN",
      "The campaign provider did not confirm the outcome. Authority was committed; reconcile before retrying.",
      { reservationId },
    );
  }

  try {
    const committed = await dependencies.authority.commit(reservationId, {
      idempotencyKey: `${keyPrefix}:commit`,
      actual: { unit: "RISK_POINTS", amount: riskPoints },
      metadata: {
        outcome: "applied",
        operation_id: input.operationId,
        provider_request_id: providerResult.providerRequestId,
      },
    });
    dependencies.audit.record({
      event: "cycles.committed",
      ...base,
      cycles_request_id: committed.requestId,
      cycles_reservation_id: reservationId,
      provider_request_id: providerResult.providerRequestId,
      risk_points: riskPoints,
    });
  } catch (error) {
    dependencies.audit.record({
      event: "cycles.settlement_pending",
      ...base,
      cycles_reservation_id: reservationId,
      provider_request_id: providerResult.providerRequestId,
      intended_settlement: "commit",
      error: messageOf(error),
    });
    throw new GatewayError(
      "SETTLEMENT_PENDING",
      "The campaign change was applied, but the Cycles commit is pending; retry only with the same operation ID.",
      {
        reservationId,
        providerRequestId: providerResult.providerRequestId,
      },
    );
  }

  return {
    status: "APPLIED",
    operationId: input.operationId,
    campaignId: input.campaignId,
    previousDailyBudgetUsd: currentDailyBudgetUsd,
    newDailyBudgetUsd: input.proposedDailyBudgetUsd,
    riskPoints,
    reservationId,
    providerRequestId: providerResult.providerRequestId,
  };
}

function toolError(error: unknown): CallToolResult {
  const gatewayError =
    error instanceof GatewayError
      ? error
      : new GatewayError("INTERNAL_ERROR", messageOf(error));
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: gatewayError.code,
            message: gatewayError.message,
            details: gatewayError.details,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createGrokBotPaidMediaServer(
  dependencies: GatewayDependencies,
  config: GatewayConfig,
): McpServer {
  const server = new McpServer({
    name: "cycles-grok-bot-paid-media-gateway",
    version: "0.1.0",
  });

  server.registerTool(
    "apply_campaign_daily_budget",
    {
      title: "Apply Campaign Daily Budget",
      description:
        "Apply an approved paid-media daily-budget change. A live Cycles RISK_POINTS reservation is mandatory and the configured account/member scope cannot be overridden by tool input.",
      inputSchema: CampaignBudgetChangeSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input, extra) => {
      try {
        const result = await applyCampaignDailyBudget(
          dependencies,
          config,
          input,
          extra.signal,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: { ...result },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
