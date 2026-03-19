import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { ExtendInputSchema } from "../schemas.js";
import { toolResult, toolError } from "./util.js";

export function registerExtendTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.tool(
    "cycles_extend",
    "Extend the TTL of an active reservation. Use as a heartbeat for long-running operations to prevent the reservation from expiring. Does not change the reserved amount.",
    ExtendInputSchema.shape,
    async (params) => {
      try {
        const response = await adapter.extendReservation(
          params.reservationId,
          {
            idempotencyKey: params.idempotencyKey,
            extendByMs: params.extendByMs,
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
