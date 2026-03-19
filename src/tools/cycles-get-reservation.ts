import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { GetReservationInputSchema } from "../schemas.js";
import { toolResult, toolError } from "./util.js";

export function registerGetReservationTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.tool(
    "cycles_get_reservation",
    "Get details of a specific reservation by ID. Returns status, subject, action, reserved amount, timestamps, and affected scopes. Useful for debugging and monitoring long-running operations.",
    GetReservationInputSchema.shape,
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
