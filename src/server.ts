import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "./client-adapter.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";

const VERSION = "0.1.1";

export function createServer(adapter: ClientAdapter): McpServer {
  const server = new McpServer(
    {
      name: "cycles-mcp-server",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  registerAllTools(server, adapter);
  registerAllResources(server, adapter);
  registerAllPrompts(server);

  return server;
}

export { VERSION };
