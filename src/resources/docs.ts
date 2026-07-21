import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// The docs directory sits at ../docs relative to the BUNDLED module (npm
// package: dist/index.js next to docs/; MCPB bundle: server/index.cjs next to
// docs/) but ../../docs relative to this SOURCE file (tsx dev, vitest). Both
// are tried in order. `import.meta.url` is undefined in the CJS MCPB bundle,
// so module-dir resolution must not run at module load and must tolerate
// failure — the CJS bundle relies on the __dirname branch instead.
function moduleDir(): string | undefined {
  if (typeof __dirname !== "undefined") return __dirname;
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return undefined;
  }
}

function loadDoc(filename: string): string {
  const dir = moduleDir();
  if (dir !== undefined) {
    for (const candidate of ["../docs", "../../docs"]) {
      try {
        return readFileSync(resolve(dir, candidate, filename), "utf-8");
      } catch {
        // try next candidate
      }
    }
  }
  return `Documentation file ${filename} not found.`;
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
