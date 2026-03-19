import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { registerReserveTool } from "./cycles-reserve.js";
import { registerCommitTool } from "./cycles-commit.js";
import { registerReleaseTool } from "./cycles-release.js";
import { registerExtendTool } from "./cycles-extend.js";
import { registerDecideTool } from "./cycles-decide.js";
import { registerCheckBalanceTool } from "./cycles-check-balance.js";
import { registerListReservationsTool } from "./cycles-list-reservations.js";
import { registerGetReservationTool } from "./cycles-get-reservation.js";
import { registerCreateEventTool } from "./cycles-create-event.js";

export function registerAllTools(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  registerReserveTool(server, adapter);
  registerCommitTool(server, adapter);
  registerReleaseTool(server, adapter);
  registerExtendTool(server, adapter);
  registerDecideTool(server, adapter);
  registerCheckBalanceTool(server, adapter);
  registerListReservationsTool(server, adapter);
  registerGetReservationTool(server, adapter);
  registerCreateEventTool(server, adapter);
}
