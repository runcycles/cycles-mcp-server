import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIntegrateCyclesPrompt } from "./integrate-cycles.js";
import { registerDiagnoseOverrunPrompt } from "./diagnose-overrun.js";
import { registerDesignBudgetStrategyPrompt } from "./design-budget-strategy.js";

export function registerAllPrompts(server: McpServer): void {
  registerIntegrateCyclesPrompt(server);
  registerDiagnoseOverrunPrompt(server);
  registerDesignBudgetStrategyPrompt(server);
}
