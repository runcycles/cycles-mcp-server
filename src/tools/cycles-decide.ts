import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { DecideInputSchema, DecideOutputSchema, validateSubject } from "../schemas.js";
import { toolResult, toolError, applySubjectDefaults, IDEMPOTENT_WRITE_TOOL } from "./util.js";

export function registerDecideTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_decide",
    {
      title: "Preflight Budget Check",
      description:
        "Lightweight preflight check — ask whether an action would be allowed without reserving budget. Does not create a reservation. Use at workflow start to decide strategy. For concurrency-safe budget locking, use cycles_reserve instead.",
      inputSchema: DecideInputSchema.shape,
      outputSchema: DecideOutputSchema,
      annotations: IDEMPOTENT_WRITE_TOOL,
    },
    async (params) => {
      try {
        const subject = applySubjectDefaults(params.subject);
        const subjectError = validateSubject(subject);
        if (subjectError) return toolError(new Error(subjectError));

        const response = await adapter.decide({
          idempotencyKey: params.idempotencyKey,
          subject,
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
