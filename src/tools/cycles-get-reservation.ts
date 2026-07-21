import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { GetReservationInputSchema, GetReservationOutputSchema } from "../schemas.js";
import { toolResult, toolError, READ_ONLY_TOOL } from "./util.js";

export function registerGetReservationTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_get_reservation",
    {
      title: "Get Reservation Details",
      description:
        "Get details of a specific reservation by ID. Returns status, subject, action, reserved amount, timestamps, and affected scopes. Useful for debugging and monitoring long-running operations.",
      inputSchema: GetReservationInputSchema.shape,
      outputSchema: GetReservationOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (params) => {
      try {
        const response = await adapter.getReservation(params.reservationId);
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
