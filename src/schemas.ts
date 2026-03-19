import { z } from "zod";

export const UnitEnum = z.enum([
  "USD_MICROCENTS",
  "TOKENS",
  "CREDITS",
  "RISK_POINTS",
]);

export const CommitOveragePolicyEnum = z.enum([
  "REJECT",
  "ALLOW_IF_AVAILABLE",
  "ALLOW_WITH_OVERDRAFT",
]);

export const ReservationStatusEnum = z.enum([
  "ACTIVE",
  "COMMITTED",
  "RELEASED",
  "EXPIRED",
]);

export const SUBJECT_STANDARD_FIELDS = [
  "tenant",
  "workspace",
  "app",
  "workflow",
  "agent",
  "toolset",
] as const;

export const SubjectObjectSchema = z.object({
  tenant: z.string().max(128).optional(),
  workspace: z.string().max(128).optional(),
  app: z.string().max(128).optional(),
  workflow: z.string().max(128).optional(),
  agent: z.string().max(128).optional(),
  toolset: z.string().max(128).optional(),
  dimensions: z.record(z.string(), z.string().max(256)).optional(),
});

export const SubjectSchema = SubjectObjectSchema.refine(
  (val) => SUBJECT_STANDARD_FIELDS.some((f) => val[f] !== undefined),
  {
    message:
      "Subject must have at least one standard field (tenant, workspace, app, workflow, agent, or toolset)",
  },
);

export const ActionSchema = z.object({
  kind: z.string().max(64),
  name: z.string().max(256),
  tags: z.array(z.string().max(64)).max(10).optional(),
});

export const AmountSchema = z.object({
  unit: UnitEnum,
  amount: z.number().int().nonnegative(),
});

export const MetricsObjectSchema = z.object({
  tokensInput: z.number().int().nonnegative().optional(),
  tokensOutput: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  modelVersion: z.string().max(128).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

// --- Per-tool input schemas (ZodObjects, no refine, so .shape works) ---

export const ReserveInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  subject: SubjectObjectSchema,
  action: ActionSchema,
  estimate: AmountSchema,
  ttlMs: z.number().int().min(1000).max(86400000).optional(),
  gracePeriodMs: z.number().int().min(0).max(60000).optional(),
  overagePolicy: CommitOveragePolicyEnum.optional(),
  dryRun: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CommitInputSchema = z.object({
  reservationId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(256),
  actual: AmountSchema,
  metrics: MetricsObjectSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ReleaseInputSchema = z.object({
  reservationId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(256),
  reason: z.string().max(256).optional(),
});

export const ExtendInputSchema = z.object({
  reservationId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(256),
  extendByMs: z.number().int().min(1).max(86400000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const DecideInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  subject: SubjectObjectSchema,
  action: ActionSchema,
  estimate: AmountSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CheckBalanceInputSchema = z.object({
  tenant: z.string().optional(),
  workspace: z.string().optional(),
  app: z.string().optional(),
  workflow: z.string().optional(),
  agent: z.string().optional(),
  toolset: z.string().optional(),
  includeChildren: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export const ListReservationsInputSchema = z.object({
  status: ReservationStatusEnum.optional(),
  idempotencyKey: z.string().optional(),
  tenant: z.string().optional(),
  workspace: z.string().optional(),
  app: z.string().optional(),
  workflow: z.string().optional(),
  agent: z.string().optional(),
  toolset: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export const GetReservationInputSchema = z.object({
  reservationId: z.string().min(1).max(128),
});

export const CreateEventInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  subject: SubjectObjectSchema,
  action: ActionSchema,
  actual: AmountSchema,
  overagePolicy: CommitOveragePolicyEnum.optional(),
  metrics: MetricsObjectSchema.optional(),
  clientTimeMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function validateSubject(subject: Record<string, unknown>): string | null {
  const hasStandardField = SUBJECT_STANDARD_FIELDS.some(
    (f) => subject[f] !== undefined,
  );
  if (!hasStandardField) {
    return "Subject must have at least one standard field (tenant, workspace, app, workflow, agent, or toolset)";
  }
  return null;
}

export function validateBalanceFilter(params: Record<string, unknown>): string | null {
  const hasFilter = SUBJECT_STANDARD_FIELDS.some(
    (f) => params[f] !== undefined,
  );
  if (!hasFilter) {
    return "At least one subject filter (tenant, workspace, app, workflow, agent, or toolset) is required";
  }
  return null;
}
