import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { CyclesClient, CyclesConfig } from "runcycles";
import {
  createGrokBotPaidMediaServer,
  type AuthorityReservation,
  type CyclesAuthority,
  type PaidMediaClient,
} from "./gateway.js";

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

class RuncyclesAuthority implements CyclesAuthority {
  constructor(private readonly client: CyclesClient) {}

  async reserve(
    request: Parameters<CyclesAuthority["reserve"]>[0],
  ): Promise<AuthorityReservation> {
    const response = await this.client.createReservation({
      idempotency_key: request.idempotencyKey,
      subject: request.subject,
      action: request.action,
      estimate: request.estimate,
      ttl_ms: 60_000,
      metadata: request.metadata,
    });

    if (response.isTransportError || response.isServerError) {
      throw new Error(
        response.errorMessage ?? "Cycles reservation service unavailable.",
      );
    }
    if (!response.isSuccess) {
      return {
        allowed: false,
        requestId: response.requestId,
        reason:
          response.getErrorResponse()?.message ??
          response.errorMessage ??
          "Cycles denied the reservation.",
      };
    }

    const decision = response.getBodyAttribute("decision");
    if (decision === "DENY") {
      const reasonCode = response.getBodyAttribute("reason_code");
      return {
        allowed: false,
        requestId: response.requestId,
        reason:
          typeof reasonCode === "string"
            ? reasonCode
            : "Cycles denied the reservation.",
      };
    }
    const reservationId = response.getBodyAttribute("reservation_id");
    if (
      (decision !== "ALLOW" && decision !== "ALLOW_WITH_CAPS") ||
      typeof reservationId !== "string"
    ) {
      throw new Error("Cycles returned an invalid live-reservation response.");
    }
    return {
      allowed: true,
      decision,
      reservationId,
      requestId: response.requestId,
    };
  }

  async commit(
    reservationId: string,
    request: Parameters<CyclesAuthority["commit"]>[1],
  ): Promise<{ requestId?: string }> {
    const response = await this.client.commitReservation(reservationId, {
      idempotency_key: request.idempotencyKey,
      actual: request.actual,
      metadata: request.metadata,
    });
    if (
      !response.isSuccess ||
      response.getBodyAttribute("status") !== "COMMITTED"
    ) {
      throw new Error(
        response.getErrorResponse()?.message ??
          response.errorMessage ??
          "Cycles did not confirm the commit.",
      );
    }
    return { requestId: response.requestId };
  }

  async release(
    reservationId: string,
    request: Parameters<CyclesAuthority["release"]>[1],
  ): Promise<{ requestId?: string }> {
    const response = await this.client.releaseReservation(reservationId, {
      idempotency_key: request.idempotencyKey,
      reason: request.reason,
    });
    if (
      !response.isSuccess ||
      response.getBodyAttribute("status") !== "RELEASED"
    ) {
      throw new Error(
        response.getErrorResponse()?.message ??
          response.errorMessage ??
          "Cycles did not confirm the release.",
      );
    }
    return { requestId: response.requestId };
  }
}

class HttpPaidMediaClient implements PaidMediaClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async readDailyBudget(
    request: Parameters<PaidMediaClient["readDailyBudget"]>[0],
  ): Promise<{ currentDailyBudgetUsd: number; providerRequestId?: string }> {
    const url = new URL(
      `campaigns/${encodeURIComponent(request.campaignId)}`,
      `${this.url.replace(/\/$/, "")}/`,
    );
    url.searchParams.set("account_id", request.accountId);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      throw new Error(`Paid-media API returned HTTP ${response.status}.`);
    }
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("daily_budget_usd" in body) ||
      typeof body.daily_budget_usd !== "number" ||
      !Number.isFinite(body.daily_budget_usd) ||
      body.daily_budget_usd < 0
    ) {
      throw new Error("Paid-media API returned an invalid current budget.");
    }
    return {
      currentDailyBudgetUsd: body.daily_budget_usd,
      providerRequestId: response.headers.get("x-request-id") ?? undefined,
    };
  }

  async applyDailyBudget(
    request: Parameters<PaidMediaClient["applyDailyBudget"]>[0],
  ): Promise<{ providerRequestId: string }> {
    const url = new URL(
      `campaigns/${encodeURIComponent(request.campaignId)}/daily-budget`,
      `${this.url.replace(/\/$/, "")}/`,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": request.operationId,
        "X-Cycles-Reservation-ID": request.cyclesReservationId,
        "X-Change-Ticket": request.changeTicket,
      },
      body: JSON.stringify({
        account_id: request.accountId,
        expected_current_daily_budget_usd:
          request.expectedCurrentDailyBudgetUsd,
        daily_budget_usd: request.proposedDailyBudgetUsd,
      }),
    });
    if (!response.ok) {
      throw new Error(`Paid-media API returned HTTP ${response.status}.`);
    }
    return {
      providerRequestId:
        response.headers.get("x-request-id") ?? request.operationId,
    };
  }
}

function bearerAuth(expectedToken: string): RequestHandler {
  return (request, response, next) => {
    const supplied = Buffer.from(request.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${expectedToken}`);
    if (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    ) {
      next();
      return;
    }
    response
      .status(401)
      .set("WWW-Authenticate", "Bearer")
      .json({ error: "Unauthorized" });
  };
}

function originPolicy(allowedOrigins: Set<string>): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("origin");
    if (origin === undefined || allowedOrigins.has(origin)) {
      next();
      return;
    }
    response.status(403).json({ error: "Origin not allowed" });
  };
}

async function main(): Promise<void> {
  const authToken = required("MCP_HTTP_AUTH_TOKEN");
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
  const server = createGrokBotPaidMediaServer(
    {
      authority: new RuncyclesAuthority(cyclesClient),
      paidMedia: new HttpPaidMediaClient(
        required("PAID_MEDIA_API_URL"),
        required("PAID_MEDIA_API_TOKEN"),
      ),
      audit: { record: (record) => console.error(JSON.stringify(record)) },
    },
    {
      tenant: required("CYCLES_TENANT"),
      memberScope: required("GROK_MEMBER_SCOPE"),
      workflow: process.env.GROK_WORKFLOW?.trim() || "paid-media-interactive",
      verifiedBotScope: process.env.GROK_VERIFIED_BOT_SCOPE?.trim() || undefined,
      paidMediaAccountId: required("PAID_MEDIA_ACCOUNT_ID"),
      maxDailyBudgetUsd: positiveNumber("MAX_DAILY_BUDGET_USD", 5_000),
    },
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const app = express();
  app.get("/health", (_request: Request, response: Response) => {
    response.json({ status: "ok" });
  });
  const policies = [
    rateLimit({
      windowMs: positiveInteger("MCP_RATE_LIMIT_WINDOW_MS", 60_000),
      limit: positiveInteger("MCP_RATE_LIMIT_MAX", 60),
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    originPolicy(allowedOrigins),
    bearerAuth(authToken),
  ];
  const handle: RequestHandler = async (request, response) => {
    await transport.handleRequest(request, response);
  };
  app.post("/mcp", ...policies, handle);
  app.get("/mcp", ...policies, handle);
  app.delete("/mcp", ...policies, handle);

  const port = positiveInteger("PORT", 3_001);
  const host = process.env.HOST?.trim() || "127.0.0.1";
  app.listen(port, host, () => {
    console.error(`Grok Bot paid-media gateway: http://${host}:${port}/mcp`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
