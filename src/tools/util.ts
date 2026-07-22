import { randomUUID } from "node:crypto";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { CyclesApiError } from "../client-adapter.js";
import { SUBJECT_STANDARD_FIELDS } from "../schemas.js";

// All Cycles tools talk only to the configured Cycles server (closed domain).
// Mutating tools require idempotency keys, so repeated identical calls are
// safe; none of them destroy data.
export const READ_ONLY_TOOL: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

export const IDEMPOTENT_WRITE_TOOL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// The protocol requires an idempotency key on every mutating call. The MCP
// input schema makes it optional ONLY for cycles_commit and cycles_release:
// their fresh-key retries hit the spec-mandated 409 RESERVATION_FINALIZED —
// loud failure, no duplicate effect, and the retry is recorded as an error
// artifact rather than a duplicate lifecycle claim. Everything else keeps
// caller-supplied keys REQUIRED: reserve/create_event (the key is the only
// dedup for new budget effects — duplicate hold / double charge), extend
// (a fresh-key retry double-extends and burns extension quota; the
// MAX_EXTENSIONS cap is quota, not dedup), and decide (each decide emits a
// signed evidence artifact — only a same-key replay suppresses duplicate
// emission).
export function ensureIdempotencyKey(key: string | undefined): string {
  return key ?? `mcp_${randomUUID()}`;
}

const SUBJECT_ENV_DEFAULTS: Record<(typeof SUBJECT_STANDARD_FIELDS)[number], string> = {
  tenant: "CYCLES_DEFAULT_TENANT",
  workspace: "CYCLES_DEFAULT_WORKSPACE",
  app: "CYCLES_DEFAULT_APP",
  workflow: "CYCLES_DEFAULT_WORKFLOW",
  agent: "CYCLES_DEFAULT_AGENT",
  toolset: "CYCLES_DEFAULT_TOOLSET",
};

// Operator-configured subject defaults (CYCLES_DEFAULT_*): fill any standard
// field the caller left unset. Explicit fields always win; dimensions are
// never defaulted. Env values bypass the Zod input schema, so they get the
// same constraints here (non-blank, <=128 chars) — a bad default is an
// operator config error and must fail loudly, not reach the wire.
export function applySubjectDefaults<T extends Record<string, unknown>>(
  subject: T | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(subject ?? {}) };
  for (const field of SUBJECT_STANDARD_FIELDS) {
    if (merged[field] === undefined) {
      const envVar = SUBJECT_ENV_DEFAULTS[field];
      const value = process.env[envVar];
      if (value !== undefined && value !== "") {
        if (value.trim() === "" || value.length > 128) {
          throw new Error(
            `Invalid ${envVar}: must be 1-128 characters and not whitespace-only (matching the subject schema constraints).`,
          );
        }
        merged[field] = value;
      }
    }
  }
  return merged;
}

const LOW_BUDGET_THRESHOLD = 0.15;

interface BalanceLike {
  scopePath?: unknown;
  remaining?: { amount?: unknown };
  allocated?: { amount?: unknown };
}

// Plain-text nudges appended after the JSON payload so the agent
// self-regulates without the host doing anything. Deliberately NOT part of
// structuredContent — that stays exactly the declared output schema.
function budgetHints(data: unknown): string[] {
  if (typeof data !== "object" || data === null) return [];
  const d = data as { decision?: unknown; balances?: unknown };
  const hints: string[] = [];
  if (d.decision === "DENY") {
    hints.push(
      "HINT: budget DENIED — do not proceed with the operation. Check remaining budget with cycles_check_balance, degrade to a cheaper approach, or stop.",
    );
  } else if (d.decision === "ALLOW_WITH_CAPS") {
    hints.push(
      "HINT: allowed WITH CAPS — inspect the caps object (maxTokens, tool allow/denylists, cooldown) and respect it while executing.",
    );
  }
  if (Array.isArray(d.balances)) {
    for (const b of d.balances as BalanceLike[]) {
      const remaining = b?.remaining?.amount;
      const allocated = b?.allocated?.amount;
      if (
        typeof remaining === "number" &&
        typeof allocated === "number" &&
        allocated > 0 &&
        remaining / allocated < LOW_BUDGET_THRESHOLD
      ) {
        const pct = Math.max(0, Math.round((remaining / allocated) * 100));
        hints.push(
          `HINT: low budget — ~${pct}% remaining on ${String(b.scopePath ?? "scope")}. Consider cheaper models, skipping optional work, or reducing retries.`,
        );
      }
    }
  }
  return hints;
}

export function toolResult(data: unknown): CallToolResult {
  const content: CallToolResult["content"] = [
    { type: "text", text: JSON.stringify(data, null, 2) },
  ];
  for (const hint of budgetHints(data)) {
    content.push({ type: "text", text: hint });
  }
  return {
    content,
    structuredContent: data as Record<string, unknown>,
  };
}

export function toolError(err: unknown): CallToolResult {
  if (err instanceof CyclesApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: err.errorCode,
              message: err.message,
              requestId: err.requestId,
              httpStatus: err.httpStatus,
              details: err.details,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: "INTERNAL_ERROR", message }, null, 2) }],
  };
}
