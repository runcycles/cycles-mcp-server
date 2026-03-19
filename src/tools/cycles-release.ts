import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { ReleaseInputSchema } from "../schemas.js";
import { toolResult, toolError } from "./util.js";

export function registerReleaseTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.tool(
    "cycles_release",
    "Release a reservation without committing. Use when an operation is cancelled, skipped, or fails before execution. Returns the released budget amount back to the pool.",
    ReleaseInputSchema.shape,
    async (params) => {
      try {
        const response = await adapter.releaseReservation(
          params.reservationId,
          {
            idempotencyKey: params.idempotencyKey,
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
