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
  dimensions: z.record(z.string(), z.string().max(256)).refine(
    (d) => Object.keys(d).length <= 16,
    { message: "dimensions must have at most 16 entries" },
  ).optional(),
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
  idempotencyKey: z.string().min(1).max(256).optional(),
  subject: SubjectObjectSchema.optional(),
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
  idempotencyKey: z.string().min(1).max(256).optional(),
  actual: AmountSchema,
  metrics: MetricsObjectSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ReleaseInputSchema = z.object({
  reservationId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(256).optional(),
  reason: z.string().max(256).optional(),
});

export const ExtendInputSchema = z.object({
  reservationId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(256).optional(),
  extendByMs: z.number().int().min(1).max(86400000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const DecideInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(256).optional(),
  subject: SubjectObjectSchema.optional(),
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
  idempotencyKey: z.string().min(1).max(256).optional(),
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
  idempotencyKey: z.string().min(1).max(256).optional(),
  subject: SubjectObjectSchema.optional(),
  action: ActionSchema,
  actual: AmountSchema,
  overagePolicy: CommitOveragePolicyEnum.optional(),
  metrics: MetricsObjectSchema.optional(),
  clientTimeMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Tool output schemas (MCP structuredContent), mirroring the spec response
// schemas as mapped by the `runcycles` client. Field optionality follows the
// spec exactly. Two deliberate loosenings so a spec-valid live response can
// never fail the SDK's structuredContent validation: enum-like status fields
// stay open strings (additive protocol values), and optional fields are
// nullish (the runcycles mappers pass scalar wire fields through untouched,
// so a server emitting explicit JSON nulls for absent fields reaches us as
// null, not undefined).
// ---------------------------------------------------------------------------

export const DecisionEnum = z.enum(["ALLOW", "ALLOW_WITH_CAPS", "DENY"]);

const OutputAmountSchema = z.object({
  unit: z.string(),
  amount: z.number(),
});

const OutputSubjectSchema = z.object({
  tenant: z.string().nullish(),
  workspace: z.string().nullish(),
  app: z.string().nullish(),
  workflow: z.string().nullish(),
  agent: z.string().nullish(),
  toolset: z.string().nullish(),
  dimensions: z.record(z.string(), z.string()).nullish(),
});

const OutputActionSchema = z.object({
  kind: z.string(),
  name: z.string(),
  tags: z.array(z.string()).nullish(),
});

export const CapsSchema = z.object({
  maxTokens: z.number().nullish(),
  maxStepsRemaining: z.number().nullish(),
  toolAllowlist: z.array(z.string()).nullish(),
  toolDenylist: z.array(z.string()).nullish(),
  cooldownMs: z.number().nullish(),
});

export const BalanceEntrySchema = z.object({
  scope: z.string(),
  scopePath: z.string(),
  remaining: OutputAmountSchema,
  reserved: OutputAmountSchema.nullish(),
  spent: OutputAmountSchema.nullish(),
  allocated: OutputAmountSchema.nullish(),
  debt: OutputAmountSchema.nullish(),
  overdraftLimit: OutputAmountSchema.nullish(),
  isOverLimit: z.boolean().nullish(),
});

const ReservationSummarySchema = z.object({
  reservationId: z.string(),
  status: z.string(),
  subject: OutputSubjectSchema,
  action: OutputActionSchema,
  reserved: OutputAmountSchema,
  createdAtMs: z.number(),
  expiresAtMs: z.number(),
  scopePath: z.string(),
  affectedScopes: z.array(z.string()),
  idempotencyKey: z.string().nullish(),
});

export const ReserveOutputSchema = {
  decision: DecisionEnum,
  reservationId: z.string().nullish(),
  affectedScopes: z.array(z.string()),
  expiresAtMs: z.number().nullish(),
  scopePath: z.string().nullish(),
  reserved: OutputAmountSchema.nullish(),
  caps: CapsSchema.nullish(),
  reasonCode: z.string().nullish(),
  retryAfterMs: z.number().nullish(),
  balances: z.array(BalanceEntrySchema).nullish(),
};

export const CommitOutputSchema = {
  status: z.string(),
  charged: OutputAmountSchema,
  released: OutputAmountSchema.nullish(),
  balances: z.array(BalanceEntrySchema).nullish(),
};

export const ReleaseOutputSchema = {
  status: z.string(),
  released: OutputAmountSchema,
  balances: z.array(BalanceEntrySchema).nullish(),
};

export const ExtendOutputSchema = {
  status: z.string(),
  expiresAtMs: z.number(),
  balances: z.array(BalanceEntrySchema).nullish(),
};

export const DecideOutputSchema = {
  decision: DecisionEnum,
  caps: CapsSchema.nullish(),
  reasonCode: z.string().nullish(),
  retryAfterMs: z.number().nullish(),
  affectedScopes: z.array(z.string()).nullish(),
};

export const CheckBalanceOutputSchema = {
  balances: z.array(BalanceEntrySchema),
  hasMore: z.boolean().nullish(),
  nextCursor: z.string().nullish(),
};

export const ListReservationsOutputSchema = {
  reservations: z.array(ReservationSummarySchema),
  hasMore: z.boolean().nullish(),
  nextCursor: z.string().nullish(),
};

export const GetReservationOutputSchema = {
  reservationId: z.string(),
  status: z.string(),
  subject: OutputSubjectSchema,
  action: OutputActionSchema,
  reserved: OutputAmountSchema,
  createdAtMs: z.number(),
  expiresAtMs: z.number(),
  scopePath: z.string(),
  affectedScopes: z.array(z.string()),
  idempotencyKey: z.string().nullish(),
  committed: OutputAmountSchema.nullish(),
  finalizedAtMs: z.number().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
};

export const CreateEventOutputSchema = {
  status: z.string(),
  eventId: z.string(),
  charged: OutputAmountSchema.nullish(),
  balances: z.array(BalanceEntrySchema).nullish(),
};

export function validateSubject(subject: Record<string, unknown>): string | null {
  const hasStandardField = SUBJECT_STANDARD_FIELDS.some(
    (f) => subject[f] !== undefined,
  );
  if (!hasStandardField) {
    return "Subject must have at least one standard field (tenant, workspace, app, workflow, agent, or toolset). Provide one in the call or configure CYCLES_DEFAULT_* environment defaults.";
  }
  return null;
}

export function validateBalanceFilter(params: Record<string, unknown>): string | null {
  const hasFilter = SUBJECT_STANDARD_FIELDS.some(
    (f) => params[f] !== undefined,
  );
  if (!hasFilter) {
    return "At least one subject filter (tenant, workspace, app, workflow, agent, or toolset) is required. Provide one in the call or configure CYCLES_DEFAULT_* environment defaults.";
  }
  return null;
}
