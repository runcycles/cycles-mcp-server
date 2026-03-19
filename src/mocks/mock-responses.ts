import { randomUUID } from "node:crypto";
import type {
  ReservationCreateRequest,
  ReservationCreateResponse,
  CommitRequest,
  CommitResponse,
  ReleaseResponse,
  ReservationExtendRequest,
  ReservationExtendResponse,
  DecisionRequest,
  DecisionResponse,
  EventCreateRequest,
  EventCreateResponse,
  BalanceResponse,
  ReservationListResponse,
  ReservationDetail,
  Balance,
  Subject,
} from "runcycles";
import {
  Decision,
  CommitStatus,
  ReleaseStatus,
  ExtendStatus,
  EventStatus,
  ReservationStatus,
} from "runcycles";

function mockBalance(scope: string, unit: string): Balance {
  return {
    scope,
    scopePath: scope,
    remaining: { unit, amount: 750_000 },
    reserved: { unit, amount: 50_000 },
    spent: { unit, amount: 200_000 },
    allocated: { unit, amount: 1_000_000 },
    debt: { unit, amount: 0 },
    overdraftLimit: { unit, amount: 100_000 },
    isOverLimit: false,
  };
}

export function mockReservationCreateResponse(
  req: ReservationCreateRequest,
): ReservationCreateResponse {
  const unit = req.estimate.unit;
  const scopePath = buildScopePath(req.subject);
  if (req.dryRun) {
    return {
      decision: Decision.ALLOW,
      affectedScopes: [scopePath],
      scopePath,
      reserved: req.estimate,
      balances: [mockBalance(scopePath, unit)],
    };
  }
  const now = Date.now();
  return {
    decision: Decision.ALLOW,
    reservationId: `rsv_${randomUUID()}`,
    affectedScopes: [scopePath],
    expiresAtMs: now + (req.ttlMs ?? 60_000),
    scopePath,
    reserved: req.estimate,
    balances: [mockBalance(scopePath, unit)],
  };
}

export function mockCommitResponse(
  _reservationId: string,
  req: CommitRequest,
): CommitResponse {
  const delta = req.actual.amount;
  return {
    status: CommitStatus.COMMITTED,
    charged: req.actual,
    released:
      delta < 1000
        ? { unit: req.actual.unit, amount: 1000 - delta }
        : undefined,
  };
}

export function mockReleaseResponse(_reservationId: string): ReleaseResponse {
  return {
    status: ReleaseStatus.RELEASED,
    released: { unit: "TOKENS", amount: 1000 },
  };
}

export function mockExtendResponse(
  _reservationId: string,
  req: ReservationExtendRequest,
): ReservationExtendResponse {
  return {
    status: ExtendStatus.ACTIVE,
    expiresAtMs: Date.now() + req.extendByMs,
  };
}

export function mockDecisionResponse(
  req: DecisionRequest,
): DecisionResponse {
  const scopePath = buildScopePath(req.subject);
  return {
    decision: Decision.ALLOW,
    affectedScopes: [scopePath],
  };
}

export function mockEventCreateResponse(
  _req: EventCreateRequest,
): EventCreateResponse {
  return {
    status: EventStatus.APPLIED,
    eventId: `evt_${randomUUID()}`,
  };
}

export function mockBalanceResponse(
  params: Record<string, string>,
): BalanceResponse {
  const scope = params.tenant ?? params.workflow ?? params.app ?? "default";
  const scopeKey = `tenant:${scope}`;
  return {
    balances: [mockBalance(scopeKey, "USD_MICROCENTS")],
    hasMore: false,
  };
}

export function mockReservationListResponse(): ReservationListResponse {
  return {
    reservations: [
      {
        reservationId: `rsv_${randomUUID()}`,
        status: ReservationStatus.ACTIVE,
        subject: { tenant: "mock-tenant" },
        action: { kind: "llm.completion", name: "openai:gpt-4o" },
        reserved: { unit: "TOKENS", amount: 1000 },
        createdAtMs: Date.now() - 30_000,
        expiresAtMs: Date.now() + 30_000,
        scopePath: "tenant:mock-tenant",
        affectedScopes: ["tenant:mock-tenant"],
      },
    ],
    hasMore: false,
  };
}

export function mockReservationDetail(
  reservationId: string,
): ReservationDetail {
  return {
    reservationId,
    status: ReservationStatus.ACTIVE,
    subject: { tenant: "mock-tenant" },
    action: { kind: "llm.completion", name: "openai:gpt-4o" },
    reserved: { unit: "TOKENS", amount: 1000 },
    createdAtMs: Date.now() - 30_000,
    expiresAtMs: Date.now() + 30_000,
    scopePath: "tenant:mock-tenant",
    affectedScopes: ["tenant:mock-tenant"],
  };
}

function buildScopePath(subject: Subject): string {
  const parts: string[] = [];
  for (const key of [
    "tenant",
    "workspace",
    "app",
    "workflow",
    "agent",
    "toolset",
  ] as const) {
    const val = subject[key];
    if (typeof val === "string") {
      parts.push(`${key}:${val}`);
    }
  }
  return parts.join("/");
}
