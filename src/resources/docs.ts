import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(__dirname, "../../docs");

function loadDoc(filename: string): string {
  try {
    return readFileSync(resolve(DOCS_DIR, filename), "utf-8");
  } catch {
    return `Documentation file ${filename} not found.`;
  }
}

export function registerDocsResources(server: McpServer): void {
  server.resource(
    "cycles-docs-quickstart",
    "cycles://docs/quickstart",
    { description: "Getting started with Cycles MCP server", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: loadDoc("quickstart.md"),
        },
      ],
    }),
  );

  server.resource(
    "cycles-docs-patterns",
    "cycles://docs/patterns",
    { description: "Cycles integration patterns and best practices", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: loadDoc("patterns.md"),
        },
      ],
    }),
  );
}
