import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { CyclesApiError } from "../client-adapter.js";

// All Cycles tools talk only to the configured Cycles server (closed domain).
// Mutating tools require idempotency keys, so repeated identical calls are
// safe; none of them destroy data.
export const READ_ONLY_TOOL: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

export const IDEMPOTENT_WRITE_TOOL: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
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
