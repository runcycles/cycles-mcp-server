import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express, { type Express, type Request } from "express";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CyclesClient, CyclesConfig } from "runcycles";
import { afterEach, describe, expect, it } from "vitest";
import type {
  GatewayConfig,
  GatewayDependencies,
} from "../examples/grok-bot-paid-media-gateway/gateway.js";
import {
  createGrokBotPaidMediaHttpApp,
  HttpPaidMediaClient,
  RuncyclesAuthority,
  type GatewayHttpHandle,
} from "../examples/grok-bot-paid-media-gateway/http.js";

const config: GatewayConfig = {
  tenant: "acme",
  memberScope: "alice-paid-media",
  workflow: "nightly-campaign-review",
  paidMediaAccountId: "ads-acme",
  maxDailyBudgetUsd: 5_000,
};

const toolArguments = {
  operationId: "campaign-change-MKT-1042",
  campaignId: "cmp_search_us",
  proposedDailyBudgetUsd: 950,
  changeTicket: "MKT-1042",
};

interface ObservedRequest {
  body: Record<string, unknown>;
  headers: Record<string, string | undefined>;
}

interface HarnessOptions {
  cyclesCommitOutcome?: "COMMITTED" | "PENDING";
  cyclesCommitStatus?: number;
  cyclesDecision?: "ALLOW" | "ALLOW_WITH_CAPS" | "DENY" | "INVALID";
  omitCyclesReservationId?: boolean;
  cyclesReserveStatus?: number;
  invalidProviderReadBody?: "missing" | "null";
  omitProviderRequestId?: boolean;
  providerReadStatus?: number;
  providerWriteStatus?: number;
  rateLimitMax?: number;
  useHttpDefaults?: boolean;
}

interface Harness {
  baseUrl: string;
  auditRecords: Array<Record<string, unknown>>;
  cycles: {
    reserves: ObservedRequest[];
    commits: ObservedRequest[];
  };
  provider: {
    reads: ObservedRequest[];
    writes: ObservedRequest[];
  };
  sequence: string[];
  dependencies: GatewayDependencies;
  gateway: GatewayHttpHandle;
  servers: HttpServer[];
}

const openHarnesses: Harness[] = [];
const openClients: Client[] = [];

function bodyOf(request: Request): Record<string, unknown> {
  return request.body as Record<string, unknown>;
}

function observed(request: Request): ObservedRequest {
  return {
    body: bodyOf(request),
    headers: {
      authorization: request.get("authorization"),
      changeTicket: request.get("x-change-ticket"),
      cyclesApiKey: request.get("x-cycles-api-key"),
      cyclesReservationId: request.get("x-cycles-reservation-id"),
      idempotencyKey:
        request.get("idempotency-key") ?? request.get("x-idempotency-key"),
    },
  };
}

async function listen(app: Express): Promise<{
  baseUrl: string;
  server: HttpServer;
}> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const sequence: string[] = [];
  const cycles = { reserves: [] as ObservedRequest[], commits: [] as ObservedRequest[] };
  const provider = { reads: [] as ObservedRequest[], writes: [] as ObservedRequest[] };

  const cyclesApp = express();
  cyclesApp.use(express.json());
  cyclesApp.post("/v1/reservations", (request, response) => {
    sequence.push("cycles.reserve");
    cycles.reserves.push(observed(request));
    response.set("X-Request-ID", "cycles-reserve-request-1");
    if (options.cyclesReserveStatus !== undefined) {
      response
        .status(options.cyclesReserveStatus)
        .json({ message: "Cycles unavailable" });
      return;
    }
    if (options.cyclesDecision === "DENY") {
      response.json({
        decision: "DENY",
        reason_code: "RISK_BUDGET_EXHAUSTED",
      });
      return;
    }
    response.json({
      decision:
        options.cyclesDecision === "INVALID"
          ? "UNRECOGNIZED"
          : (options.cyclesDecision ?? "ALLOW"),
      reservation_id: options.omitCyclesReservationId
        ? undefined
        : "rsv_e2e_1",
    });
  });
  cyclesApp.post(
    "/v1/reservations/:reservationId/commit",
    (request, response) => {
      sequence.push("cycles.commit");
      cycles.commits.push(observed(request));
      if (options.cyclesCommitStatus !== undefined) {
        response
          .status(options.cyclesCommitStatus)
          .json({ message: "commit unavailable" });
        return;
      }
      response
        .set("X-Request-ID", "cycles-commit-request-1")
        .json({ status: options.cyclesCommitOutcome ?? "COMMITTED" });
    },
  );
  const cyclesHttp = await listen(cyclesApp);

  const providerApp = express();
  providerApp.use(express.json());
  providerApp.get("/campaigns/:campaignId", (request, response) => {
    sequence.push("provider.read");
    provider.reads.push(observed(request));
    if (options.providerReadStatus !== undefined) {
      response
        .status(options.providerReadStatus)
        .json({ error: "provider unavailable" });
      return;
    }
    if (options.invalidProviderReadBody === "missing") {
      response.json({});
      return;
    }
    if (options.invalidProviderReadBody === "null") {
      response.json(null);
      return;
    }
    if (!options.omitProviderRequestId) {
      response.set("X-Request-ID", "provider-read-request-1");
    }
    response.json({ daily_budget_usd: 800 });
  });
  providerApp.post(
    "/campaigns/:campaignId/daily-budget",
    (request, response) => {
      sequence.push("provider.write");
      provider.writes.push(observed(request));
      if (options.providerWriteStatus !== undefined) {
        response.status(options.providerWriteStatus).json({ error: "stale" });
        return;
      }
      if (!options.omitProviderRequestId) {
        response.set("X-Request-ID", "provider-write-request-1");
      }
      response.json({ status: "ok" });
    },
  );
  const providerHttp = await listen(providerApp);

  const auditRecords: Array<Record<string, unknown>> = [];
  const cyclesClient = new CyclesClient(
    new CyclesConfig({
      baseUrl: cyclesHttp.baseUrl,
      apiKey: "cycles-e2e-key",
      retryEnabled: false,
      journalEnabled: false,
    }),
  );
  const dependencies: GatewayDependencies = {
    authority: new RuncyclesAuthority(cyclesClient),
    paidMedia: new HttpPaidMediaClient(
      providerHttp.baseUrl,
      "paid-media-e2e-token",
    ),
    audit: { record: (record) => auditRecords.push(record) },
  };
  const gateway = await createGrokBotPaidMediaHttpApp(
    dependencies,
    config,
    options.useHttpDefaults
      ? { authToken: "mcp-e2e-token" }
      : {
          authToken: "mcp-e2e-token",
          allowedOrigins: new Set(["https://grok.com"]),
          rateLimitMax: options.rateLimitMax ?? 100,
        },
  );
  const gatewayHttp = await listen(gateway.app);
  const harness = {
    baseUrl: gatewayHttp.baseUrl,
    auditRecords,
    cycles,
    provider,
    sequence,
    dependencies,
    gateway,
    servers: [gatewayHttp.server, providerHttp.server, cyclesHttp.server],
  };
  openHarnesses.push(harness);
  return harness;
}

async function connectClient(
  baseUrl: string,
  includeOrigin = true,
): Promise<Client> {
  const client = new Client({ name: "grok-gateway-e2e", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp`),
    {
      requestInit: {
        headers: includeOrigin
          ? {
              Authorization: "Bearer mcp-e2e-token",
              Origin: "https://grok.com",
            }
          : { Authorization: "Bearer mcp-e2e-token" },
      },
    },
  );
  await client.connect(transport);
  openClients.push(client);
  return client;
}

function toolErrorCode(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const first = result.content[0];
  if (first?.type !== "text") throw new Error("Expected a text tool result.");
  return (JSON.parse(first.text) as { error: string }).error;
}

afterEach(async () => {
  await Promise.allSettled(openClients.splice(0).map((client) => client.close()));
  for (const harness of openHarnesses.splice(0)) {
    await Promise.allSettled([
      harness.gateway.close(),
      ...harness.servers.map(closeHttpServer),
    ]);
  }
});

describe("Grok Bot paid-media HTTP integration", () => {
  it("carries trusted scope and correlation through MCP, Cycles, and the provider", async () => {
    const harness = await createHarness();
    const client = await connectClient(harness.baseUrl);

    const result = await client.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      status: "APPLIED",
      operationId: toolArguments.operationId,
      campaignId: toolArguments.campaignId,
      previousDailyBudgetUsd: 800,
      newDailyBudgetUsd: 950,
      riskPoints: 35,
      reservationId: "rsv_e2e_1",
      providerRequestId: "provider-write-request-1",
    });
    expect(harness.sequence).toEqual([
      "provider.read",
      "cycles.reserve",
      "provider.write",
      "cycles.commit",
    ]);
    expect(harness.cycles.reserves).toEqual([
      {
        headers: {
          authorization: undefined,
          changeTicket: undefined,
          cyclesApiKey: "cycles-e2e-key",
          cyclesReservationId: undefined,
          idempotencyKey: `grok-paid-media:${toolArguments.operationId}:reserve`,
        },
        body: expect.objectContaining({
          idempotency_key: `grok-paid-media:${toolArguments.operationId}:reserve`,
          subject: {
            tenant: "acme",
            workspace: "alice-paid-media",
            app: "grok-bot",
            workflow: "nightly-campaign-review",
            agent: "member-shared",
            toolset: "paid-media",
          },
          estimate: { unit: "RISK_POINTS", amount: 35 },
        }),
      },
    ]);
    expect(harness.provider.reads[0]).toMatchObject({
      headers: { authorization: "Bearer paid-media-e2e-token" },
    });
    expect(harness.provider.writes).toEqual([
      {
        headers: {
          authorization: "Bearer paid-media-e2e-token",
          changeTicket: toolArguments.changeTicket,
          cyclesApiKey: undefined,
          cyclesReservationId: "rsv_e2e_1",
          idempotencyKey: toolArguments.operationId,
        },
        body: {
          account_id: "ads-acme",
          expected_current_daily_budget_usd: 800,
          daily_budget_usd: 950,
        },
      },
    ]);
    expect(harness.cycles.commits[0]).toMatchObject({
      headers: {
        cyclesApiKey: "cycles-e2e-key",
        idempotencyKey: `grok-paid-media:${toolArguments.operationId}:commit`,
      },
      body: {
        idempotency_key: `grok-paid-media:${toolArguments.operationId}:commit`,
        actual: { unit: "RISK_POINTS", amount: 35 },
        metadata: expect.objectContaining({ outcome: "applied" }),
      },
    });
    expect(harness.auditRecords.map((record) => record.event)).toEqual([
      "cycles.reserved",
      "campaign.dispatching",
      "cycles.committed",
    ]);
  });

  it("fails closed at the HTTP boundary when Cycles denies authority", async () => {
    const harness = await createHarness({ cyclesDecision: "DENY" });
    const client = await connectClient(harness.baseUrl);

    const result = await client.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });

    expect(result.isError).toBe(true);
    expect(toolErrorCode(result)).toBe("CYCLES_DENIED");
    expect(harness.sequence).toEqual(["provider.read", "cycles.reserve"]);
    expect(harness.provider.writes).toHaveLength(0);
    expect(harness.cycles.commits).toHaveLength(0);
  });

  it("commits exposure when an atomic provider write rejects stale state", async () => {
    const harness = await createHarness({ providerWriteStatus: 409 });
    const client = await connectClient(harness.baseUrl);

    const result = await client.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });

    expect(result.isError).toBe(true);
    expect(toolErrorCode(result)).toBe("DOWNSTREAM_OUTCOME_UNKNOWN");
    expect(harness.sequence).toEqual([
      "provider.read",
      "cycles.reserve",
      "provider.write",
      "cycles.commit",
    ]);
    expect(harness.cycles.commits[0]?.body).toMatchObject({
      metadata: expect.objectContaining({
        outcome: "downstream_unknown",
        error: "Paid-media API returned HTTP 409.",
      }),
    });
  });

  it("fails closed across real upstream HTTP failures", async () => {
    const providerFailure = await createHarness({ providerReadStatus: 503 });
    const providerFailureClient = await connectClient(providerFailure.baseUrl);
    const unreadable = await providerFailureClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(unreadable)).toBe("CURRENT_BUDGET_UNAVAILABLE");
    expect(providerFailure.sequence).toEqual(["provider.read"]);

    const cyclesFailure = await createHarness({ cyclesReserveStatus: 503 });
    const cyclesFailureClient = await connectClient(cyclesFailure.baseUrl);
    const unavailable = await cyclesFailureClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(unavailable)).toBe("CYCLES_UNAVAILABLE");
    expect(cyclesFailure.sequence).toEqual([
      "provider.read",
      "cycles.reserve",
    ]);

    const malformedProvider = await createHarness({
      invalidProviderReadBody: "missing",
    });
    const malformedProviderClient = await connectClient(
      malformedProvider.baseUrl,
    );
    const malformed = await malformedProviderClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(malformed)).toBe("CURRENT_BUDGET_UNAVAILABLE");
    expect(malformedProvider.sequence).toEqual(["provider.read"]);

    const nullProvider = await createHarness({
      invalidProviderReadBody: "null",
    });
    const nullProviderClient = await connectClient(nullProvider.baseUrl);
    const nullBudget = await nullProviderClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(nullBudget)).toBe("CURRENT_BUDGET_UNAVAILABLE");
    expect(nullProvider.sequence).toEqual(["provider.read"]);
  });

  it("validates Cycles protocol decisions and settlement acknowledgements", async () => {
    const capped = await createHarness({ cyclesDecision: "ALLOW_WITH_CAPS" });
    const cappedClient = await connectClient(capped.baseUrl);
    const cappedResult = await cappedClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(cappedResult.structuredContent).toMatchObject({ status: "APPLIED" });

    const clientError = await createHarness({ cyclesReserveStatus: 409 });
    const clientErrorClient = await connectClient(clientError.baseUrl);
    const refused = await clientErrorClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(refused)).toBe("CYCLES_DENIED");

    const invalidDecision = await createHarness({ cyclesDecision: "INVALID" });
    const invalidDecisionClient = await connectClient(invalidDecision.baseUrl);
    const invalid = await invalidDecisionClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(invalid)).toBe("CYCLES_UNAVAILABLE");

    const missingReservation = await createHarness({
      omitCyclesReservationId: true,
    });
    const missingReservationClient = await connectClient(
      missingReservation.baseUrl,
    );
    const missing = await missingReservationClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(missing)).toBe("CYCLES_UNAVAILABLE");

    const pendingCommit = await createHarness({ cyclesCommitOutcome: "PENDING" });
    const pendingCommitClient = await connectClient(pendingCommit.baseUrl);
    const pending = await pendingCommitClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(pending)).toBe("SETTLEMENT_PENDING");

    const failedCommit = await createHarness({ cyclesCommitStatus: 503 });
    const failedCommitClient = await connectClient(failedCommit.baseUrl);
    const failed = await failedCommitClient.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(toolErrorCode(failed)).toBe("SETTLEMENT_PENDING");
  });

  it("enforces health isolation, bearer auth, origin policy, and rate limits", async () => {
    const harness = await createHarness({ rateLimitMax: 2 });
    const health = await fetch(`${harness.baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: "ok" });

    const missingAuth = await fetch(`${harness.baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(missingAuth.status).toBe(401);
    expect(missingAuth.headers.get("www-authenticate")).toBe("Bearer");

    const rejectedOrigin = await fetch(`${harness.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer mcp-e2e-token",
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: "{}",
    });
    expect(rejectedOrigin.status).toBe(403);

    const rateLimited = await fetch(`${harness.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer mcp-e2e-token",
        "Content-Type": "application/json",
        Origin: "https://grok.com",
      },
      body: "{}",
    });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get("ratelimit")).not.toBeNull();
  });

  it("supports secure defaults, originless clients, and provider ID fallback", async () => {
    const harness = await createHarness({
      omitProviderRequestId: true,
      useHttpDefaults: true,
    });
    const wrongToken = await fetch(`${harness.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer mcp-e2e-tokem",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(wrongToken.status).toBe(401);

    const client = await connectClient(harness.baseUrl, false);
    const result = await client.callTool({
      name: "apply_campaign_daily_budget",
      arguments: toolArguments,
    });
    expect(result.structuredContent).toMatchObject({
      status: "APPLIED",
      providerRequestId: toolArguments.operationId,
    });

    const unsupportedGet = await fetch(`${harness.baseUrl}/mcp`, {
      headers: { Authorization: "Bearer mcp-e2e-token" },
    });
    expect(unsupportedGet.status).toBe(405);
  });

  it("rejects unsafe HTTP configuration before opening a transport", async () => {
    const harness = await createHarness();
    await expect(
      createGrokBotPaidMediaHttpApp(harness.dependencies, config, {
        authToken: " ",
      }),
    ).rejects.toThrow("authToken is required");
    await expect(
      createGrokBotPaidMediaHttpApp(harness.dependencies, config, {
        authToken: "valid",
        rateLimitMax: 0,
      }),
    ).rejects.toThrow("rateLimitMax must be a positive integer");
    await expect(
      createGrokBotPaidMediaHttpApp(harness.dependencies, config, {
        authToken: "valid",
        rateLimitWindowMs: 1.5,
      }),
    ).rejects.toThrow("rateLimitWindowMs must be a positive integer");
  });
});
