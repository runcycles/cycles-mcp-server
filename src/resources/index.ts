import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { registerBalancesResource } from "./balances.js";
import { registerReservationsResource } from "./reservations.js";
import { registerDocsResources } from "./docs.js";

export function registerAllResources(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  registerBalancesResource(server, adapter);
  registerReservationsResource(server, adapter);
  registerDocsResources(server);
}
