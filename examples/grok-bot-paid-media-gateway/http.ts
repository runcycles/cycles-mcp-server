import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { type CyclesClient } from "runcycles";
import {
  createGrokBotPaidMediaServer,
  type AuthorityReservation,
  type CyclesAuthority,
  type GatewayConfig,
  type GatewayDependencies,
  type PaidMediaClient,
} from "./gateway.js";

export class RuncyclesAuthority implements CyclesAuthority {
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

export class HttpPaidMediaClient implements PaidMediaClient {
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

function originPolicy(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("origin");
    if (origin === undefined || allowedOrigins.has(origin)) {
      next();
      return;
    }
    response.status(403).json({ error: "Origin not allowed" });
  };
}

export interface GatewayHttpOptions {
  authToken: string;
  allowedOrigins?: ReadonlySet<string>;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export interface GatewayHttpHandle {
  app: Express;
  close(): Promise<void>;
}

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export async function createGrokBotPaidMediaHttpApp(
  dependencies: GatewayDependencies,
  config: GatewayConfig,
  options: GatewayHttpOptions,
): Promise<GatewayHttpHandle> {
  if (options.authToken.trim().length === 0) {
    throw new Error("authToken is required.");
  }
  const rateLimitWindowMs = positiveSafeInteger(
    options.rateLimitWindowMs ?? 60_000,
    "rateLimitWindowMs",
  );
  const rateLimitMax = positiveSafeInteger(
    options.rateLimitMax ?? 60,
    "rateLimitMax",
  );
  const activeServers = new Set<
    ReturnType<typeof createGrokBotPaidMediaServer>
  >();

  const app = express();
  app.use(express.json());
  app.get("/health", (_request: Request, response: Response) => {
    response.json({ status: "ok" });
  });
  const policies = [
    rateLimit({
      windowMs: rateLimitWindowMs,
      limit: rateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    originPolicy(options.allowedOrigins ?? new Set()),
    bearerAuth(options.authToken),
  ];
  const handle: RequestHandler = async (request, response) => {
    const server = createGrokBotPaidMediaServer(dependencies, config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    activeServers.add(server);
    const closeServer = () => {
      if (activeServers.delete(server)) {
        void server.close();
      }
    };
    response.once("close", closeServer);
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      response.off("close", closeServer);
      if (activeServers.delete(server)) {
        await server.close();
      }
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };
  const methodNotAllowed: RequestHandler = (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  };
  app.post("/mcp", ...policies, handle);
  app.get("/mcp", ...policies, methodNotAllowed);
  app.delete("/mcp", ...policies, methodNotAllowed);

  return {
    app,
    async close() {
      const servers = [...activeServers];
      activeServers.clear();
      await Promise.all(servers.map((server) => server.close()));
    },
  };
}
