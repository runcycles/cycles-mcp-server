import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "./server.js";

export type TransportMode = "stdio" | "http";

export function parseTransportMode(args: string[]): TransportMode {
  const idx = args.indexOf("--transport");
  if (idx !== -1 && args[idx + 1]) {
    const mode = args[idx + 1];
    if (mode === "stdio" || mode === "http") return mode;
    throw new Error(`Unknown transport mode: ${mode}. Use "stdio" or "http".`);
  }
  return "stdio";
}

export async function startStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cycles MCP server running on stdio");
}

export async function startHttp(
  server: McpServer,
  port: number,
): Promise<ReturnType<typeof express>> {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: VERSION });
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  app.post("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
  });

  app.get("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
  });

  await server.connect(transport);

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.error(`Cycles MCP server running on http://localhost:${port}`);
      console.error(`  Health: http://localhost:${port}/health`);
      console.error(`  MCP:    http://localhost:${port}/mcp`);
      resolve();
    });
  });

  return app;
}
