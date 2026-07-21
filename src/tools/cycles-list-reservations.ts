import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { ListReservationsInputSchema, ListReservationsOutputSchema } from "../schemas.js";
import { toolResult, toolError, READ_ONLY_TOOL } from "./util.js";

export function registerListReservationsTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_list_reservations",
    {
      title: "List Reservations",
      description:
        "List reservations, optionally filtered by status (ACTIVE, COMMITTED, RELEASED, EXPIRED) or subject fields. Useful for debugging stuck reservations or auditing budget usage.",
      inputSchema: ListReservationsInputSchema.shape,
      outputSchema: ListReservationsOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (params) => {
      try {
        const queryParams: Record<string, string> = {};
        for (const key of [
          "status",
          "tenant",
          "workspace",
          "app",
          "workflow",
          "agent",
          "toolset",
          "cursor",
        ] as const) {
          if (params[key]) queryParams[key] = params[key];
        }
        if (params.idempotencyKey)
          queryParams.idempotency_key = params.idempotencyKey;
        if (params.limit !== undefined)
          queryParams.limit = String(params.limit);

        const response = await adapter.listReservations(queryParams);
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
