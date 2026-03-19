import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { CreateEventInputSchema, validateSubject } from "../schemas.js";
import { toolResult, toolError } from "./util.js";

export function registerCreateEventTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.tool(
    "cycles_create_event",
    "Record a usage event directly without the reserve/commit lifecycle. Use for fire-and-forget metering of completed operations where pre-estimation is not available. The event is applied atomically to all derived scopes.",
    CreateEventInputSchema.shape,
    async (params) => {
      try {
        const subjectError = validateSubject(params.subject);
        if (subjectError) return toolError(new Error(subjectError));

        const response = await adapter.createEvent({
          idempotencyKey: params.idempotencyKey,
          subject: params.subject,
          action: params.action,
          actual: params.actual,
          overagePolicy: params.overagePolicy,
          metrics: params.metrics ?? undefined,
          clientTimeMs: params.clientTimeMs,
          metadata: params.metadata,
        });
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
