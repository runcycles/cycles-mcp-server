import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";

export function registerBalancesResource(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.resource(
    "cycles-balance",
    new ResourceTemplate("cycles://balances/{tenant}", { list: undefined }),
    { description: "Current budget balance for a tenant scope", mimeType: "application/json" },
    async (uri, variables) => {
      const tenant = variables.tenant as string;
      const response = await adapter.getBalances({ tenant });
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
