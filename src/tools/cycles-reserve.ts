import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { ReserveInputSchema, validateSubject } from "../schemas.js";
import { toolResult, toolError } from "./util.js";

export function registerReserveTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.tool(
    "cycles_reserve",
    "Reserve budget before a costly operation (LLM call, tool invocation, external action). Returns a reservation_id to commit or release later. If decision is not ALLOW, do not proceed with the operation. For lightweight preflight checks without reserving, use cycles_decide instead.",
    ReserveInputSchema.shape,
    async (params) => {
      try {
        const subjectError = validateSubject(params.subject);
        if (subjectError) return toolError(new Error(subjectError));

        const response = await adapter.createReservation({
          idempotencyKey: params.idempotencyKey,
          subject: params.subject,
          action: params.action,
          estimate: params.estimate,
          ttlMs: params.ttlMs,
          gracePeriodMs: params.gracePeriodMs,
          overagePolicy: params.overagePolicy,
          dryRun: params.dryRun,
          metadata: params.metadata,
        });
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
