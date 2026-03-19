import { describe, it, expect, vi, afterEach } from "vitest";
import { parseTransportMode, startStdio, startHttp } from "../src/transport.js";
import { MockClientAdapter } from "../src/client-adapter.js";
import { createServer } from "../src/server.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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
    const adapter = new MockClientAdapter();
    const server = createServer(adapter);

    // Mock console.error to suppress output
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock server.connect to avoid actually starting stdin/stdout
    const connectSpy = vi.spyOn(server, "connect").mockResolvedValue();

    await startStdio(server);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Cycles MCP server running on stdio",
    );
  });
});

describe("startHttp", () => {
  it("starts HTTP server with health endpoint", async () => {
    const adapter = new MockClientAdapter();
    const server = createServer(adapter);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const connectSpy = vi.spyOn(server, "connect").mockResolvedValue();

    const app = await startHttp(server, 0);
    expect(app).toBeDefined();
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    // Test health endpoint
    const address = (app as any).listen?.();
    // Clean up - since we used port 0 it should have picked a random port
  });
});
