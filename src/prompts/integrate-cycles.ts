import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerIntegrateCyclesPrompt(server: McpServer): void {
  server.prompt(
    "integrate_cycles",
    "Generate Cycles integration code for an existing agentic workflow. Produces reserve/commit/release patterns for the specified language and use case.",
    {
      language: z.string().optional().describe("Programming language (default: typescript)"),
      use_case: z.string().optional().describe("Use case context, e.g. 'llm-calls', 'api-gateway', 'multi-agent'"),
    },
    async (args) => {
      const lang = args.language ?? "typescript";
      const useCase = args.use_case ?? "general agentic workflow";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Generate Cycles budget integration code in ${lang} for the following use case: ${useCase}.

The integration MUST follow the Cycles reserve/commit/release lifecycle:

1. **check_budget** (optional) — Call cycles_check_balance to inspect remaining budget before starting.
2. **reserve** — Call cycles_reserve with a Subject (tenant/workspace/app/workflow/agent/toolset), Action (kind/name), and Amount estimate before each costly operation.
3. **execute** — If decision is ALLOW or ALLOW_WITH_CAPS (respecting any caps), proceed with the operation. If DENY, stop or degrade.
4. **commit** — Call cycles_commit with actual usage after the operation completes (whether success or failure).
5. **release** — Call cycles_release if the operation was skipped or cancelled (instead of commit).

Key requirements:
- Every reservation MUST be finalized with either commit or release — never leave reservations dangling.
- Generate a unique idempotencyKey (UUID) for each reserve/commit/release call.
- Use the correct unit enum: USD_MICROCENTS, TOKENS, CREDITS, or RISK_POINTS.
- Handle ALLOW_WITH_CAPS by checking the caps object for max_tokens, tool_allowlist, tool_denylist constraints.
- For long-running operations, use cycles_extend to heartbeat the reservation TTL.
- Include error handling for BUDGET_EXCEEDED, RESERVATION_EXPIRED, and DEBT_OUTSTANDING errors.`,
            },
          },
        ],
      };
    },
  );
}
