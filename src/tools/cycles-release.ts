import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { ReleaseInputSchema, ReleaseOutputSchema } from "../schemas.js";
import { toolResult, toolError, ensureIdempotencyKey, IDEMPOTENT_WRITE_TOOL } from "./util.js";

export function registerReleaseTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_release",
    {
      title: "Release Reservation",
      description:
        "Release a reservation without committing. Use when an operation is cancelled, skipped, or fails before execution. Returns the released budget amount back to the pool.",
      inputSchema: ReleaseInputSchema.shape,
      outputSchema: ReleaseOutputSchema,
      annotations: IDEMPOTENT_WRITE_TOOL,
    },
    async (params) => {
      try {
        const response = await adapter.releaseReservation(
          params.reservationId,
          {
            idempotencyKey: ensureIdempotencyKey(params.idempotencyKey),
            reason: params.reason,
          },
        );
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
