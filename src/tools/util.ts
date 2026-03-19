import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CyclesApiError } from "../client-adapter.js";

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(err: unknown): CallToolResult {
  if (err instanceof CyclesApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: err.errorCode,
              message: err.message,
              requestId: err.requestId,
              httpStatus: err.httpStatus,
              details: err.details,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: "INTERNAL_ERROR", message }, null, 2) }],
  };
}
