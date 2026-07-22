import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { CreateEventInputSchema, CreateEventOutputSchema, validateSubject } from "../schemas.js";
import { toolResult, toolError, ensureIdempotencyKey, applySubjectDefaults, IDEMPOTENT_WRITE_TOOL } from "./util.js";

export function registerCreateEventTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_create_event",
    {
      title: "Record Usage Event",
      description:
        "Record a usage event directly without the reserve/commit lifecycle. Use for fire-and-forget metering of completed operations where pre-estimation is not available. The event is applied atomically to all derived scopes.",
      inputSchema: CreateEventInputSchema.shape,
      outputSchema: CreateEventOutputSchema,
      annotations: IDEMPOTENT_WRITE_TOOL,
    },
    async (params) => {
      try {
        const subject = applySubjectDefaults(params.subject);
        const subjectError = validateSubject(subject);
        if (subjectError) return toolError(new Error(subjectError));

        const response = await adapter.createEvent({
          idempotencyKey: ensureIdempotencyKey(params.idempotencyKey),
          subject,
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
