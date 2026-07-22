import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientAdapter } from "../client-adapter.js";
import { CheckBalanceInputSchema, CheckBalanceOutputSchema, validateBalanceFilter } from "../schemas.js";
import { toolResult, toolError, applySubjectDefaults, READ_ONLY_TOOL } from "./util.js";

export function registerCheckBalanceTool(
  server: McpServer,
  adapter: ClientAdapter,
): void {
  server.registerTool(
    "cycles_check_balance",
    {
      title: "Check Budget Balance",
      description:
        "Check current budget balance for a scope. Returns remaining, reserved, spent, allocated, and debt amounts. At least one subject filter (tenant, workspace, app, workflow, agent, or toolset) is required. Do not use as a substitute for cycles_reserve — balances can change between check and action.",
      inputSchema: CheckBalanceInputSchema.shape,
      outputSchema: CheckBalanceOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (params) => {
      try {
        const filters = applySubjectDefaults(params);
        const filterError = validateBalanceFilter(filters);
        if (filterError) return toolError(new Error(filterError));

        const queryParams: Record<string, string> = {};
        for (const key of [
          "tenant",
          "workspace",
          "app",
          "workflow",
          "agent",
          "toolset",
        ] as const) {
          if (typeof filters[key] === "string" && filters[key]) queryParams[key] = filters[key];
        }
        if (params.includeChildren !== undefined)
          queryParams.include_children = String(params.includeChildren);
        if (params.limit !== undefined)
          queryParams.limit = String(params.limit);
        if (params.cursor) queryParams.cursor = params.cursor;

        const response = await adapter.getBalances(queryParams);
        return toolResult(response);
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
