import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDiagnoseOverrunPrompt(server: McpServer): void {
  server.prompt(
    "diagnose_overrun",
    "Analyze budget exhaustion or a stopped run. Guides through checking balances, listing reservations, and identifying the root cause of budget issues.",
    {
      reservation_id: z.string().optional().describe("Specific reservation ID to investigate"),
      scope: z.string().optional().describe("Tenant or scope identifier to check balances for"),
    },
    async (args) => {
      const parts: string[] = [
        "Diagnose why budget was exhausted or a run was stopped. Follow these steps:",
        "",
      ];

      if (args.scope) {
        parts.push(
          `1. Call cycles_check_balance with tenant="${args.scope}" to see current balance state (remaining, spent, reserved, debt, isOverLimit).`,
        );
      } else {
        parts.push(
          "1. Call cycles_check_balance with the relevant tenant to see current balance state (remaining, spent, reserved, debt, isOverLimit).",
        );
      }

      if (args.reservation_id) {
        parts.push(
          `2. Call cycles_get_reservation with reservationId="${args.reservation_id}" to inspect its status, timestamps, and reserved amount.`,
        );
      } else {
        parts.push(
          '2. Call cycles_list_reservations with status="ACTIVE" to find any stuck reservations that are holding budget.',
        );
      }

      parts.push(
        "",
        "3. Look for these common issues:",
        "   - **Zombie reservations**: ACTIVE reservations past their expiresAtMs — these lock budget until they expire.",
        "   - **Underestimation**: Committed amounts consistently higher than reserved amounts (check committed vs reserved in reservation details).",
        "   - **Debt accumulation**: Balance shows debt > 0, which blocks new reservations until repaid.",
        "   - **Over-limit state**: isOverLimit=true means overdraft limit was exceeded — no new reservations until debt is reduced.",
        "   - **Missing commits**: Reservations that were never committed or released — the budget stays locked until TTL expires.",
        "",
        "4. Recommend remediation:",
        "   - For zombie reservations: release them explicitly with cycles_release.",
        "   - For underestimation: increase estimate amounts or use ALLOW_IF_AVAILABLE overage policy.",
        "   - For debt/over-limit: budget must be funded via the admin API (out of scope for this MCP server).",
        "   - For missing commits: ensure all code paths finalize reservations with commit or release.",
      );

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: parts.join("\n") },
          },
        ],
      };
    },
  );
}
