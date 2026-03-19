import { describe, it, expect } from "vitest";
import {
  UnitEnum,
  CommitOveragePolicyEnum,
  ReservationStatusEnum,
  SubjectSchema,
  SubjectObjectSchema,
  ActionSchema,
  AmountSchema,
  MetricsObjectSchema,
  ReserveInputSchema,
  CommitInputSchema,
  ReleaseInputSchema,
  ExtendInputSchema,
  DecideInputSchema,
  CheckBalanceInputSchema,
  ListReservationsInputSchema,
  GetReservationInputSchema,
  CreateEventInputSchema,
  validateSubject,
  validateBalanceFilter,
} from "../src/schemas.js";

describe("UnitEnum", () => {
  it("accepts valid units", () => {
    for (const unit of ["USD_MICROCENTS", "TOKENS", "CREDITS", "RISK_POINTS"]) {
      expect(UnitEnum.parse(unit)).toBe(unit);
    }
  });

  it("rejects invalid units", () => {
    expect(() => UnitEnum.parse("DOLLARS")).toThrow();
    expect(() => UnitEnum.parse("requests")).toThrow();
    expect(() => UnitEnum.parse("")).toThrow();
  });
});

describe("CommitOveragePolicyEnum", () => {
  it("accepts valid policies", () => {
    for (const p of ["REJECT", "ALLOW_IF_AVAILABLE", "ALLOW_WITH_OVERDRAFT"]) {
      expect(CommitOveragePolicyEnum.parse(p)).toBe(p);
    }
  });

  it("rejects invalid policies", () => {
    expect(() => CommitOveragePolicyEnum.parse("ALLOW")).toThrow();
  });
});

describe("ReservationStatusEnum", () => {
  it("accepts valid statuses", () => {
    for (const s of ["ACTIVE", "COMMITTED", "RELEASED", "EXPIRED"]) {
      expect(ReservationStatusEnum.parse(s)).toBe(s);
    }
  });

  it("rejects invalid statuses", () => {
    expect(() => ReservationStatusEnum.parse("PENDING")).toThrow();
  });
});

describe("SubjectSchema (with refine)", () => {
  it("accepts subject with tenant", () => {
    expect(SubjectSchema.parse({ tenant: "t1" })).toEqual({ tenant: "t1" });
  });

  it("accepts subject with workflow only", () => {
    expect(SubjectSchema.parse({ workflow: "w1" })).toEqual({ workflow: "w1" });
  });

  it("accepts subject with all fields", () => {
    const subject = {
      tenant: "t1",
      workspace: "ws",
      app: "a1",
      workflow: "w1",
      agent: "ag1",
      toolset: "ts1",
      dimensions: { project: "p1" },
    };
    expect(SubjectSchema.parse(subject)).toEqual(subject);
  });

  it("rejects empty subject", () => {
    expect(() => SubjectSchema.parse({})).toThrow();
  });

  it("rejects subject with only dimensions", () => {
    expect(() =>
      SubjectSchema.parse({ dimensions: { foo: "bar" } }),
    ).toThrow();
  });
});

describe("SubjectObjectSchema (without refine)", () => {
  it("accepts empty object", () => {
    expect(SubjectObjectSchema.parse({})).toEqual({});
  });

  it("enforces max length", () => {
    expect(() =>
      SubjectObjectSchema.parse({ tenant: "a".repeat(129) }),
    ).toThrow();
  });

  it("accepts dimensions with up to 16 entries", () => {
    const dims: Record<string, string> = {};
    for (let i = 0; i < 16; i++) dims[`key${i}`] = `val${i}`;
    expect(SubjectObjectSchema.parse({ tenant: "t1", dimensions: dims })).toMatchObject({
      tenant: "t1",
    });
  });

  it("rejects dimensions with more than 16 entries", () => {
    const dims: Record<string, string> = {};
    for (let i = 0; i < 17; i++) dims[`key${i}`] = `val${i}`;
    expect(() =>
      SubjectObjectSchema.parse({ tenant: "t1", dimensions: dims }),
    ).toThrow();
  });
});

describe("ActionSchema", () => {
  it("accepts valid action", () => {
    expect(ActionSchema.parse({ kind: "llm.completion", name: "gpt-4o" })).toEqual({
      kind: "llm.completion",
      name: "gpt-4o",
    });
  });

  it("accepts action with tags", () => {
    const action = { kind: "tool.search", name: "web", tags: ["prod"] };
    expect(ActionSchema.parse(action)).toEqual(action);
  });

  it("rejects missing kind", () => {
    expect(() => ActionSchema.parse({ name: "gpt-4o" })).toThrow();
  });

  it("rejects missing name", () => {
    expect(() => ActionSchema.parse({ kind: "llm.completion" })).toThrow();
  });

  it("rejects too many tags", () => {
    expect(() =>
      ActionSchema.parse({
        kind: "k",
        name: "n",
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
      }),
    ).toThrow();
  });
});

describe("AmountSchema", () => {
  it("accepts valid amount", () => {
    expect(AmountSchema.parse({ unit: "TOKENS", amount: 1000 })).toEqual({
      unit: "TOKENS",
      amount: 1000,
    });
  });

  it("accepts zero amount", () => {
    expect(AmountSchema.parse({ unit: "USD_MICROCENTS", amount: 0 })).toEqual({
      unit: "USD_MICROCENTS",
      amount: 0,
    });
  });

  it("rejects negative amount", () => {
    expect(() =>
      AmountSchema.parse({ unit: "TOKENS", amount: -1 }),
    ).toThrow();
  });

  it("rejects invalid unit", () => {
    expect(() =>
      AmountSchema.parse({ unit: "DOLLARS", amount: 100 }),
    ).toThrow();
  });

  it("rejects float amount", () => {
    expect(() =>
      AmountSchema.parse({ unit: "TOKENS", amount: 1.5 }),
    ).toThrow();
  });
});

describe("MetricsObjectSchema", () => {
  it("accepts partial metrics", () => {
    expect(MetricsObjectSchema.parse({ tokensInput: 100 })).toEqual({
      tokensInput: 100,
    });
  });

  it("accepts full metrics", () => {
    const metrics = {
      tokensInput: 100,
      tokensOutput: 200,
      latencyMs: 350,
      modelVersion: "gpt-4o-2024-05-13",
      custom: { foo: "bar" },
    };
    expect(MetricsObjectSchema.parse(metrics)).toEqual(metrics);
  });

  it("accepts empty object", () => {
    expect(MetricsObjectSchema.parse({})).toEqual({});
  });

  it("rejects negative tokensInput", () => {
    expect(() =>
      MetricsObjectSchema.parse({ tokensInput: -1 }),
    ).toThrow();
  });
});

describe("ReserveInputSchema", () => {
  const validInput = {
    idempotencyKey: "key-1",
    subject: { tenant: "t1" },
    action: { kind: "llm.completion", name: "gpt-4o" },
    estimate: { unit: "TOKENS", amount: 1000 },
  };

  it("accepts minimal valid input", () => {
    expect(ReserveInputSchema.parse(validInput)).toMatchObject(validInput);
  });

  it("accepts all optional fields", () => {
    const full = {
      ...validInput,
      ttlMs: 30000,
      gracePeriodMs: 5000,
      overagePolicy: "REJECT",
      dryRun: true,
      metadata: { key: "val" },
    };
    expect(ReserveInputSchema.parse(full)).toMatchObject(full);
  });

  it("rejects ttlMs below 1000", () => {
    expect(() =>
      ReserveInputSchema.parse({ ...validInput, ttlMs: 999 }),
    ).toThrow();
  });

  it("rejects ttlMs above 86400000", () => {
    expect(() =>
      ReserveInputSchema.parse({ ...validInput, ttlMs: 86400001 }),
    ).toThrow();
  });

  it("rejects gracePeriodMs below 0", () => {
    expect(() =>
      ReserveInputSchema.parse({ ...validInput, gracePeriodMs: -1 }),
    ).toThrow();
  });

  it("rejects gracePeriodMs above 60000", () => {
    expect(() =>
      ReserveInputSchema.parse({ ...validInput, gracePeriodMs: 60001 }),
    ).toThrow();
  });

  it("rejects missing idempotencyKey", () => {
    const { idempotencyKey: _, ...rest } = validInput;
    expect(() => ReserveInputSchema.parse(rest)).toThrow();
  });
});

describe("CommitInputSchema", () => {
  const validInput = {
    reservationId: "rsv_123",
    idempotencyKey: "key-2",
    actual: { unit: "TOKENS", amount: 850 },
  };

  it("accepts minimal valid input", () => {
    expect(CommitInputSchema.parse(validInput)).toMatchObject(validInput);
  });

  it("accepts with metrics", () => {
    const full = {
      ...validInput,
      metrics: { tokensInput: 100, tokensOutput: 200 },
    };
    expect(CommitInputSchema.parse(full)).toMatchObject(full);
  });

  it("rejects empty reservationId", () => {
    expect(() =>
      CommitInputSchema.parse({ ...validInput, reservationId: "" }),
    ).toThrow();
  });
});

describe("ReleaseInputSchema", () => {
  it("accepts minimal input", () => {
    expect(
      ReleaseInputSchema.parse({ reservationId: "rsv_1", idempotencyKey: "k" }),
    ).toMatchObject({ reservationId: "rsv_1", idempotencyKey: "k" });
  });

  it("accepts with reason", () => {
    expect(
      ReleaseInputSchema.parse({
        reservationId: "rsv_1",
        idempotencyKey: "k",
        reason: "cancelled",
      }),
    ).toMatchObject({ reason: "cancelled" });
  });
});

describe("ExtendInputSchema", () => {
  it("accepts valid input", () => {
    expect(
      ExtendInputSchema.parse({
        reservationId: "rsv_1",
        idempotencyKey: "k",
        extendByMs: 60000,
      }),
    ).toMatchObject({ extendByMs: 60000 });
  });

  it("rejects extendByMs below 1", () => {
    expect(() =>
      ExtendInputSchema.parse({
        reservationId: "rsv_1",
        idempotencyKey: "k",
        extendByMs: 0,
      }),
    ).toThrow();
  });

  it("rejects extendByMs above 86400000", () => {
    expect(() =>
      ExtendInputSchema.parse({
        reservationId: "rsv_1",
        idempotencyKey: "k",
        extendByMs: 86400001,
      }),
    ).toThrow();
  });
});

describe("DecideInputSchema", () => {
  it("accepts valid input", () => {
    const input = {
      idempotencyKey: "k",
      subject: { tenant: "t1" },
      action: { kind: "llm.completion", name: "gpt-4o" },
      estimate: { unit: "TOKENS", amount: 500 },
    };
    expect(DecideInputSchema.parse(input)).toMatchObject(input);
  });
});

describe("CheckBalanceInputSchema", () => {
  it("accepts with tenant", () => {
    expect(CheckBalanceInputSchema.parse({ tenant: "t1" })).toMatchObject({
      tenant: "t1",
    });
  });

  it("accepts with multiple filters", () => {
    expect(
      CheckBalanceInputSchema.parse({ tenant: "t1", workflow: "w1" }),
    ).toMatchObject({ tenant: "t1", workflow: "w1" });
  });

  it("accepts empty object (validation is in handler)", () => {
    expect(CheckBalanceInputSchema.parse({})).toEqual({});
  });

  it("accepts with pagination", () => {
    expect(
      CheckBalanceInputSchema.parse({ tenant: "t1", limit: 10, cursor: "abc" }),
    ).toMatchObject({ limit: 10, cursor: "abc" });
  });

  it("rejects limit below 1", () => {
    expect(() =>
      CheckBalanceInputSchema.parse({ tenant: "t1", limit: 0 }),
    ).toThrow();
  });

  it("rejects limit above 200", () => {
    expect(() =>
      CheckBalanceInputSchema.parse({ tenant: "t1", limit: 201 }),
    ).toThrow();
  });
});

describe("ListReservationsInputSchema", () => {
  it("accepts empty input", () => {
    expect(ListReservationsInputSchema.parse({})).toEqual({});
  });

  it("accepts status filter", () => {
    expect(
      ListReservationsInputSchema.parse({ status: "ACTIVE" }),
    ).toMatchObject({ status: "ACTIVE" });
  });

  it("rejects invalid status", () => {
    expect(() =>
      ListReservationsInputSchema.parse({ status: "PENDING" }),
    ).toThrow();
  });

  it("accepts idempotencyKey with valid length", () => {
    expect(
      ListReservationsInputSchema.parse({ idempotencyKey: "key-123" }),
    ).toMatchObject({ idempotencyKey: "key-123" });
  });

  it("rejects empty idempotencyKey", () => {
    expect(() =>
      ListReservationsInputSchema.parse({ idempotencyKey: "" }),
    ).toThrow();
  });

  it("rejects idempotencyKey over 256 chars", () => {
    expect(() =>
      ListReservationsInputSchema.parse({ idempotencyKey: "a".repeat(257) }),
    ).toThrow();
  });
});

describe("GetReservationInputSchema", () => {
  it("accepts valid reservationId", () => {
    expect(
      GetReservationInputSchema.parse({ reservationId: "rsv_123" }),
    ).toEqual({ reservationId: "rsv_123" });
  });

  it("rejects empty reservationId", () => {
    expect(() =>
      GetReservationInputSchema.parse({ reservationId: "" }),
    ).toThrow();
  });
});

describe("CreateEventInputSchema", () => {
  const validInput = {
    idempotencyKey: "k",
    subject: { tenant: "t1" },
    action: { kind: "llm.completion", name: "gpt-4o" },
    actual: { unit: "TOKENS", amount: 500 },
  };

  it("accepts minimal valid input", () => {
    expect(CreateEventInputSchema.parse(validInput)).toMatchObject(validInput);
  });

  it("accepts all optional fields", () => {
    const full = {
      ...validInput,
      overagePolicy: "ALLOW_WITH_OVERDRAFT",
      metrics: { tokensInput: 100 },
      clientTimeMs: Date.now(),
      metadata: { source: "test" },
    };
    expect(CreateEventInputSchema.parse(full)).toMatchObject(full);
  });
});

describe("validateSubject", () => {
  it("returns null for valid subject", () => {
    expect(validateSubject({ tenant: "t1" })).toBeNull();
  });

  it("returns error for empty subject", () => {
    expect(validateSubject({})).toBeTruthy();
  });

  it("returns error for dimensions-only subject", () => {
    expect(validateSubject({ dimensions: { foo: "bar" } })).toBeTruthy();
  });
});

describe("validateBalanceFilter", () => {
  it("returns null for valid filter", () => {
    expect(validateBalanceFilter({ tenant: "t1" })).toBeNull();
  });

  it("returns error for empty filter", () => {
    expect(validateBalanceFilter({})).toBeTruthy();
  });

  it("returns error for non-subject params only", () => {
    expect(validateBalanceFilter({ limit: "10" })).toBeTruthy();
  });
});
