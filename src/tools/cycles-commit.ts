import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { CommitInputSchema } from "../schemas.js";
import { toolResult, toolError } from "./util.js";

export function registerCommitTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.tool(
    "cycles_commit",
    "Commit actual usage after an operation completes. Always call this after cycles_reserve whether the operation succeeded or failed. Finalizes the budget charge and releases any unused reserved amount back to the pool.",
    CommitInputSchema.shape,
    async (params) => {
      try {
        const response = await adapter.commitReservation(
          params.reservationId,
          {
            idempotencyKey: params.idempotencyKey,
            actual: params.actual,
            metrics: params.metrics ?? undefined,
            metadata: params.metadata,
          },
        );
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
