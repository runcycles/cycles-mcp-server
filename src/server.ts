import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import type { ClientAdapter } from "./client-adapter.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";

// Injected by tsup `define` in the MCPB bundle build, where import.meta.url
// is unavailable (CJS) and package.json is not shipped. All other builds
// (ESM dist, tsx dev, vitest) read package.json at runtime.
declare const __MCPB_VERSION__: string | undefined;

const VERSION =
  typeof __MCPB_VERSION__ === "string"
    ? __MCPB_VERSION__
    : ((
        JSON.parse(
          readFileSync(new URL("../package.json", import.meta.url), "utf8"),
        ) as { version: string }
      ).version);

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
