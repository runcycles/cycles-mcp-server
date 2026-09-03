import { CyclesClient, CyclesConfig } from "runcycles";
import type { GatewayConfig } from "./gateway.js";
import {
  createGrokBotPaidMediaHttpApp,
  HttpPaidMediaClient,
  RuncyclesAuthority,
} from "./http.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const value = positiveNumber(name, fallback);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

async function main(): Promise<void> {
  const allowedOrigins = new Set(
    (process.env.MCP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const cyclesClient = new CyclesClient(
    new CyclesConfig({
      baseUrl: required("CYCLES_BASE_URL"),
      apiKey: required("CYCLES_API_KEY"),
    }),
  );
  const config: GatewayConfig = {
    tenant: required("CYCLES_TENANT"),
    memberScope: required("GROK_MEMBER_SCOPE"),
    workflow: process.env.GROK_WORKFLOW?.trim() || "paid-media-interactive",
    verifiedBotScope: process.env.GROK_VERIFIED_BOT_SCOPE?.trim() || undefined,
    paidMediaAccountId: required("PAID_MEDIA_ACCOUNT_ID"),
    maxDailyBudgetUsd: positiveNumber("MAX_DAILY_BUDGET_USD", 5_000),
  };
  const gateway = await createGrokBotPaidMediaHttpApp(
    {
      authority: new RuncyclesAuthority(cyclesClient),
      paidMedia: new HttpPaidMediaClient(
        required("PAID_MEDIA_API_URL"),
        required("PAID_MEDIA_API_TOKEN"),
      ),
      audit: { record: (record) => console.error(JSON.stringify(record)) },
    },
    config,
    {
      authToken: required("MCP_HTTP_AUTH_TOKEN"),
      allowedOrigins,
      rateLimitMax: positiveInteger("MCP_RATE_LIMIT_MAX", 60),
      rateLimitWindowMs: positiveInteger("MCP_RATE_LIMIT_WINDOW_MS", 60_000),
    },
  );

  const port = positiveInteger("PORT", 3_001);
  const host = process.env.HOST?.trim() || "127.0.0.1";
  gateway.app.listen(port, host, () => {
    console.error(`Grok Bot paid-media gateway: http://${host}:${port}/mcp`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
