import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "./server.js";

export type TransportMode = "stdio" | "http";

interface HttpRequestTransport {
  handleRequest(req: Request, res: Response): Promise<void>;
}

export interface HttpTransportOptions {
  host?: string;
  authToken?: string;
}

export type HttpServerHandle = Express & {
  httpServer: HttpServer;
};

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

function bearerTokenMatches(header: string | undefined, token: string): boolean {
  if (header === undefined) return false;

  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function bearerAuth(token: string): RequestHandler {
  return (req, res, next) => {
    if (bearerTokenMatches(req.get("authorization"), token)) {
      next();
      return;
    }

    res
      .status(401)
      .set("WWW-Authenticate", "Bearer")
      .json({ error: "Unauthorized" });
  };
}

export function isLoopbackAddress(host: string | undefined): boolean {
  if (host === undefined) return false;

  const normalized = host.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

export function createHttpApp(
  transport: HttpRequestTransport,
  authToken?: string,
): Express {
  if (authToken !== undefined && authToken.trim().length === 0) {
    throw new Error(
      "MCP_HTTP_AUTH_TOKEN must not be empty or whitespace-only when configured.",
    );
  }

  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: VERSION });
  });

  const authHandlers =
    authToken === undefined ? [] : [bearerAuth(authToken)];
  const handleMcpRequest: RequestHandler = async (req, res) => {
    await transport.handleRequest(req, res);
  };

  app.post("/mcp", ...authHandlers, handleMcpRequest);
  app.get("/mcp", ...authHandlers, handleMcpRequest);
  app.delete("/mcp", ...authHandlers, handleMcpRequest);

  return app;
}

export async function startHttp(
  server: McpServer,
  port: number,
  options: HttpTransportOptions = {},
): Promise<HttpServerHandle> {
  const host = options.host ?? process.env.HOST;
  const authToken = options.authToken ?? process.env.MCP_HTTP_AUTH_TOKEN;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const app = createHttpApp(transport, authToken);

  if (authToken === undefined && !isLoopbackAddress(host)) {
    console.warn(
      [
        "WARNING: MCP HTTP authentication is disabled on a non-loopback bind.",
        "Anyone who can reach /mcp can invoke Cycles tools.",
        "Set MCP_HTTP_AUTH_TOKEN or bind HOST to a loopback address.",
      ].join("\n"),
    );
  }

  await server.connect(transport);

  const displayHost = host ?? "0.0.0.0";
  const httpServer = await new Promise<HttpServer>((resolve) => {
    const onListening = () => {
      console.error(`Cycles MCP server running on http://${displayHost}:${port}`);
      console.error(`  Health: http://${displayHost}:${port}/health`);
      console.error(`  MCP:    http://${displayHost}:${port}/mcp`);
      resolve(listener);
    };
    const listener = host
      ? app.listen(port, host, onListening)
      : app.listen(port, onListening);
  });

  return Object.assign(app, { httpServer });
}
