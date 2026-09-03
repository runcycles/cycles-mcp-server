import express from "express";
import { rateLimit } from "express-rate-limit";

const app = express();
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use(express.json());
const campaignBudgets = new Map([["cmp_search_us", 800]]);

function authorized(authorization: string | undefined): boolean {
  return authorization === "Bearer demo-paid-media-token";
}

app.get("/campaigns/:campaignId", (request, response) => {
  if (!authorized(request.get("authorization"))) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  const current = campaignBudgets.get(request.params.campaignId);
  if (current === undefined) {
    response.status(404).json({ error: "Campaign not found" });
    return;
  }
  response
    .status(200)
    .set("X-Request-ID", `read-${request.params.campaignId}`)
    .json({ daily_budget_usd: current });
});

app.post("/campaigns/:campaignId/daily-budget", (request, response) => {
  if (!authorized(request.get("authorization"))) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  const current = campaignBudgets.get(request.params.campaignId);
  if (current === undefined) {
    response.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (request.body.expected_current_daily_budget_usd !== current) {
    response.status(409).json({ error: "Campaign budget changed" });
    return;
  }
  campaignBudgets.set(
    request.params.campaignId,
    request.body.daily_budget_usd,
  );
  const requestId = request.get("idempotency-key") ?? "missing-operation-id";
  console.log(
    JSON.stringify({
      event: "mock_paid_media.applied",
      request_id: requestId,
      cycles_reservation_id: request.get("x-cycles-reservation-id"),
      change_ticket: request.get("x-change-ticket"),
      body: request.body,
    }),
  );
  response.status(200).set("X-Request-ID", requestId).json({ status: "ok" });
});

app.listen(4_100, "127.0.0.1", () => {
  console.log("Mock paid-media API: http://127.0.0.1:4100");
});
