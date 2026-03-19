import { vi } from "vitest";
import { MockClientAdapter, CyclesApiError } from "../src/client-adapter.js";
import type { ClientAdapter } from "../src/client-adapter.js";

export function createMockAdapter(): ClientAdapter {
  return new MockClientAdapter();
}

export function mockFetch(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): void {
  const mockHeaders = new Map(Object.entries(headers ?? {}));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      statusText: status >= 400 ? "Error" : "OK",
      json: () => Promise.resolve(body),
      headers: { get: (name: string) => mockHeaders.get(name) ?? null },
    }),
  );
}

export function mockFetchError(error: Error): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
}

export function createApiError(
  code: string,
  message: string,
  httpStatus: number = 409,
): CyclesApiError {
  return new CyclesApiError(code, message, "req-123", httpStatus);
}
