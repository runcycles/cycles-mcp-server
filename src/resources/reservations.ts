import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";

export function registerReservationsResource(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.resource(
    "cycles-reservation",
    new ResourceTemplate("cycles://reservations/{reservation_id}", {
      list: undefined,
    }),
    { description: "Reservation details by ID", mimeType: "application/json" },
    async (uri, variables) => {
      const reservationId = variables.reservation_id as string;
      const response = await adapter.getReservation(reservationId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );
}
