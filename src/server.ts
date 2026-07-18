import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import type { ClientAdapter } from "./client-adapter.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

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
