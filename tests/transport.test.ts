import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import type { Express } from "express";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createHttpApp,
  isLoopbackAddress,
  parseTransportMode,
  startStdio,
  startHttp,
} from "../src/transport.js";
import { MockClientAdapter } from "../src/client-adapter.js";
import { createServer, VERSION } from "../src/server.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function listen(app: Express): Promise<{
  baseUrl: string;
  server: HttpServer;
}> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

async function close(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("parseTransportMode", () => {
  it("returns stdio by default", () => {
    expect(parseTransportMode([])).toBe("stdio");
  });

  it("returns stdio when explicitly specified", () => {
    expect(parseTransportMode(["--transport", "stdio"])).toBe("stdio");
  });

  it("returns http when specified", () => {
    expect(parseTransportMode(["--transport", "http"])).toBe("http");
  });

  it("returns stdio when --transport has no value", () => {
    expect(parseTransportMode(["--transport"])).toBe("stdio");
  });

  it("throws on unknown transport mode", () => {
    expect(() => parseTransportMode(["--transport", "grpc"])).toThrow(
      "Unknown transport mode",
    );
  });

  it("ignores other args", () => {
    expect(parseTransportMode(["--foo", "bar", "--transport", "http"])).toBe(
      "http",
    );
  });
});

describe("startStdio", () => {
  it("connects server to stdio transport", async () => {
    const server = createServer(new MockClientAdapter());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const connectSpy = vi.spyOn(server, "connect").mockResolvedValue();

    await startStdio(server);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Cycles MCP server running on stdio",
    );
  });
});

describe("HTTP bearer authentication", () => {
  it("rejects missing and invalid bearer tokens on /mcp", async () => {
    const handleRequest = vi.fn(async (_req, res) => {
      res.sendStatus(204);
    });
    const { baseUrl, server } = await listen(
      createHttpApp({ handleRequest }, "correct-token"),
    );

    try {
      for (const { method, authorization } of [
        { method: "POST", authorization: undefined },
        { method: "GET", authorization: "Basic credentials" },
        { method: "DELETE", authorization: "Bearer wrongxx-token" },
      ]) {
        const headers = authorization ? { authorization } : undefined;
        const response = await fetch(`${baseUrl}/mcp`, {
          method,
          headers,
        });
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toBe("Bearer");
        await expect(response.json()).resolves.toEqual({
          error: "Unauthorized",
        });
      }
      expect(handleRequest).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });

  it("accepts the configured bearer token", async () => {
    const handleRequest = vi.fn(async (_req, res) => {
      res.sendStatus(204);
    });
    const { baseUrl, server } = await listen(
      createHttpApp({ handleRequest }, "correct-token"),
    );

    try {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { authorization: "Bearer correct-token" },
      });
      expect(response.status).toBe(204);
      expect(handleRequest).toHaveBeenCalledTimes(1);
    } finally {
      await close(server);
    }
  });

  it("leaves /mcp open when no token is configured", async () => {
    const handleRequest = vi.fn(async (_req, res) => {
      res.sendStatus(204);
    });
    const { baseUrl, server } = await listen(createHttpApp({ handleRequest }));

    try {
      const response = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
      expect(response.status).toBe(204);
      expect(handleRequest).toHaveBeenCalledTimes(1);
    } finally {
      await close(server);
    }
  });

  it("keeps the health endpoint public and reports package version", async () => {
    const handleRequest = vi.fn();
    const { baseUrl, server } = await listen(
      createHttpApp({ handleRequest }, "correct-token"),
    );

    try {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        version: VERSION,
      });
      expect(handleRequest).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });
});

describe("HTTP bind warnings", () => {
  it.each([
    ["localhost", true],
    ["LOCALHOST", true],
    ["127.0.0.1", true],
    ["127.25.0.9", true],
    ["::1", true],
    ["[::1]", true],
    ["0.0.0.0", false],
    ["::", false],
    [undefined, false],
  ])("classifies %s as loopback=%s", (host, expected) => {
    expect(isLoopbackAddress(host)).toBe(expected);
  });

  it("warns when unauthenticated HTTP binds beyond loopback", async () => {
    const server = createServer(new MockClientAdapter());
    vi.spyOn(server, "connect").mockResolvedValue();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("MCP_HTTP_AUTH_TOKEN", "");

    const app = await startHttp(server, 0, { host: "0.0.0.0" });
    try {
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain(
        "MCP HTTP authentication is disabled on a non-loopback bind",
      );
    } finally {
      await close(app.httpServer);
    }
  });

  it("does not warn for an unauthenticated loopback bind", async () => {
    const server = createServer(new MockClientAdapter());
    const connectSpy = vi.spyOn(server, "connect").mockResolvedValue();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("MCP_HTTP_AUTH_TOKEN", "");

    const app = await startHttp(server, 0, {
      host: "127.0.0.1",
    });
    try {
      expect(app).toBeDefined();
      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      await close(app.httpServer);
    }
  });
});
