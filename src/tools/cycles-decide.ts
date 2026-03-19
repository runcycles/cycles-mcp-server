import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { DecideInputSchema, validateSubject } from "../schemas.js";
import { toolResult, toolError } from "./util.js";

export function registerDecideTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.tool(
    "cycles_decide",
    "Lightweight preflight check — ask whether an action would be allowed without reserving budget. Does not create a reservation. Use at workflow start to decide strategy. For concurrency-safe budget locking, use cycles_reserve instead.",
    DecideInputSchema.shape,
    async (params) => {
      try {
        const subjectError = validateSubject(params.subject);
        if (subjectError) return toolError(new Error(subjectError));

        const response = await adapter.decide({
          idempotencyKey: params.idempotencyKey,
          subject: params.subject,
          action: params.action,
          estimate: params.estimate,
          metadata: params.metadata,
        });
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
