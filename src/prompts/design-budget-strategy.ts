import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerDesignBudgetStrategyPrompt(server: McpServer): void {
  server.prompt(
    "design_budget_strategy",
    "Given a workflow description, recommend scope hierarchy, budget limits, units, TTL settings, and degradation strategy for Cycles integration.",
    {
      description: z.string().describe("Description of the workflow or system to budget"),
      tenant_model: z.string().optional().describe("How tenants are structured, e.g. 'per-customer', 'per-team', 'single-tenant'"),
    },
    async (args) => {
      const tenantContext = args.tenant_model
        ? `\nTenant model: ${args.tenant_model}`
        : "";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Design a Cycles budget strategy for the following system:

${args.description}${tenantContext}

Provide recommendations for:

## 1. Subject Hierarchy
Define the scope hierarchy using Cycles Subject fields: tenant, workspace, app, workflow, agent, toolset.
- Which levels to use and what they map to in the system.
- Canonical scope path examples (e.g., tenant:acme/workspace:prod/workflow:summarize).

## 2. Unit Selection
Choose from: USD_MICROCENTS, TOKENS, CREDITS, RISK_POINTS.
- USD_MICROCENTS: best for cost tracking across heterogeneous providers (1 USD = 10^8 microcents).
- TOKENS: best for single-model LLM workflows.
- CREDITS: best for abstract unit systems with custom exchange rates.
- RISK_POINTS: best for risk-weighted budgeting.

## 3. Budget Limits
Recommend per-scope budget allocations with rationale.

## 4. TTL & Grace Period
- ttlMs: how long reservations should live (default 60s, max 24h).
- gracePeriodMs: grace window for in-flight commits after TTL (default 5s, max 60s).
- Whether to use cycles_extend heartbeats for long operations.

## 5. Overage Policy
Choose per scope: REJECT, ALLOW_IF_AVAILABLE, or ALLOW_WITH_OVERDRAFT.
- REJECT: strictest — must pre-estimate accurately.
- ALLOW_IF_AVAILABLE: allows overage if budget exists.
- ALLOW_WITH_OVERDRAFT: allows overage up to overdraft_limit, creating debt.

## 6. Degradation Strategy
What to do when budget is constrained (ALLOW_WITH_CAPS):
- Downgrade to cheaper models.
- Skip optional tool calls.
- Reduce max retries.
- Shorten context windows.`,
            },
          },
        ],
      };
    },
  );
}
