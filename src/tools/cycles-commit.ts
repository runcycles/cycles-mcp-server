import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { CommitInputSchema, CommitOutputSchema } from "../schemas.js";
import { toolResult, toolError, ensureIdempotencyKey, IDEMPOTENT_WRITE_TOOL } from "./util.js";

export function registerCommitTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_commit",
    {
      title: "Commit Usage",
      description:
        "Commit actual usage after an operation completes. Always call this after cycles_reserve whether the operation succeeded or failed. Finalizes the budget charge and releases any unused reserved amount back to the pool.",
      inputSchema: CommitInputSchema.shape,
      outputSchema: CommitOutputSchema,
      annotations: IDEMPOTENT_WRITE_TOOL,
    },
    async (params) => {
      try {
        const response = await adapter.commitReservation(
          params.reservationId,
          {
            idempotencyKey: ensureIdempotencyKey(params.idempotencyKey),
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
