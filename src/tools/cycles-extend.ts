import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { ExtendInputSchema, ExtendOutputSchema } from "../schemas.js";
import { toolResult, toolError, IDEMPOTENT_WRITE_TOOL } from "./util.js";

export function registerExtendTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_extend",
    {
      title: "Extend Reservation TTL",
      description:
        "Extend the TTL of an active reservation. Use as a heartbeat for long-running operations to prevent the reservation from expiring. Does not change the reserved amount.",
      inputSchema: ExtendInputSchema.shape,
      outputSchema: ExtendOutputSchema,
      annotations: IDEMPOTENT_WRITE_TOOL,
    },
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
