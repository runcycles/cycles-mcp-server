import type {
  ReservationCreateRequest,
  ReservationCreateResponse,
  CommitRequest,
  CommitResponse,
  ReleaseRequest,
  ReleaseResponse,
  ReservationExtendRequest,
  ReservationExtendResponse,
  DecisionRequest,
  DecisionResponse,
  EventCreateRequest,
  EventCreateResponse,
  BalanceResponse,
  ReservationListResponse,
  ReservationDetail,
} from "runcycles";
import {
  CyclesClient,
  CyclesConfig,
  CyclesResponse,
  reservationCreateRequestToWire,
  commitRequestToWire,
  releaseRequestToWire,
  reservationExtendRequestToWire,
  decisionRequestToWire,
  eventCreateRequestToWire,
  reservationCreateResponseFromWire,
  commitResponseFromWire,
  releaseResponseFromWire,
  reservationExtendResponseFromWire,
  decisionResponseFromWire,
  eventCreateResponseFromWire,
  balanceResponseFromWire,
  reservationListResponseFromWire,
  reservationDetailFromWire,
  errorResponseFromWire,
} from "runcycles";
import {
  mockReservationCreateResponse,
  mockCommitResponse,
  mockReleaseResponse,
  mockExtendResponse,
  mockDecisionResponse,
  mockEventCreateResponse,
  mockBalanceResponse,
  mockReservationListResponse,
  mockReservationDetail,
} from "./mocks/mock-responses.js";

export interface ClientAdapter {
  createReservation(
    req: ReservationCreateRequest,
  ): Promise<ReservationCreateResponse>;
  commitReservation(
    reservationId: string,
    req: CommitRequest,
  ): Promise<CommitResponse>;
  releaseReservation(
    reservationId: string,
    req: ReleaseRequest,
  ): Promise<ReleaseResponse>;
  extendReservation(
    reservationId: string,
    req: ReservationExtendRequest,
  ): Promise<ReservationExtendResponse>;
  decide(req: DecisionRequest): Promise<DecisionResponse>;
  getBalances(params: Record<string, string>): Promise<BalanceResponse>;
  listReservations(
    params?: Record<string, string>,
  ): Promise<ReservationListResponse>;
  getReservation(reservationId: string): Promise<ReservationDetail>;
  createEvent(req: EventCreateRequest): Promise<EventCreateResponse>;
}

export class CyclesApiError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly requestId?: string,
    public readonly httpStatus?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CyclesApiError";
  }
}

function assertSuccess(response: CyclesResponse): Record<string, unknown> {
  if (response.isSuccess) {
    return response.body ?? {};
  }

  const errBody = response.body ?? {};
  const parsed = errorResponseFromWire(errBody);
  if (parsed) {
    throw new CyclesApiError(
      parsed.error,
      parsed.message,
      parsed.requestId,
      response.status,
      parsed.details,
    );
  }

  throw new CyclesApiError(
    "UNKNOWN",
    (errBody?.message as string) ?? "Unknown error",
    undefined,
    response.status,
  );
}

export class RealClientAdapter implements ClientAdapter {
  private readonly client: CyclesClient;

  constructor(config?: CyclesConfig) {
    this.client = new CyclesClient(config ?? CyclesConfig.fromEnv());
  }

  async createReservation(
    req: ReservationCreateRequest,
  ): Promise<ReservationCreateResponse> {
    const wire = reservationCreateRequestToWire(req);
    const resp = await this.client.createReservation(wire);
    return reservationCreateResponseFromWire(assertSuccess(resp));
  }

  async commitReservation(
    reservationId: string,
    req: CommitRequest,
  ): Promise<CommitResponse> {
    const wire = commitRequestToWire(req);
    const resp = await this.client.commitReservation(reservationId, wire);
    return commitResponseFromWire(assertSuccess(resp));
  }

  async releaseReservation(
    reservationId: string,
    req: ReleaseRequest,
  ): Promise<ReleaseResponse> {
    const wire = releaseRequestToWire(req);
    const resp = await this.client.releaseReservation(reservationId, wire);
    return releaseResponseFromWire(assertSuccess(resp));
  }

  async extendReservation(
    reservationId: string,
    req: ReservationExtendRequest,
  ): Promise<ReservationExtendResponse> {
    const wire = reservationExtendRequestToWire(req);
    const resp = await this.client.extendReservation(reservationId, wire);
    return reservationExtendResponseFromWire(assertSuccess(resp));
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    const wire = decisionRequestToWire(req);
    const resp = await this.client.decide(wire);
    return decisionResponseFromWire(assertSuccess(resp));
  }

  async getBalances(params: Record<string, string>): Promise<BalanceResponse> {
    const resp = await this.client.getBalances(params);
    return balanceResponseFromWire(assertSuccess(resp));
  }

  async listReservations(
    params?: Record<string, string>,
  ): Promise<ReservationListResponse> {
    const resp = await this.client.listReservations(params);
    return reservationListResponseFromWire(assertSuccess(resp));
  }

  async getReservation(reservationId: string): Promise<ReservationDetail> {
    const resp = await this.client.getReservation(reservationId);
    return reservationDetailFromWire(assertSuccess(resp));
  }

  async createEvent(req: EventCreateRequest): Promise<EventCreateResponse> {
    const wire = eventCreateRequestToWire(req);
    const resp = await this.client.createEvent(wire);
    return eventCreateResponseFromWire(assertSuccess(resp));
  }
}

export class MockClientAdapter implements ClientAdapter {
  async createReservation(
    req: ReservationCreateRequest,
  ): Promise<ReservationCreateResponse> {
    return mockReservationCreateResponse(req);
  }

  async commitReservation(
    reservationId: string,
    req: CommitRequest,
  ): Promise<CommitResponse> {
    return mockCommitResponse(reservationId, req);
  }

  async releaseReservation(
    reservationId: string,
    _req: ReleaseRequest,
  ): Promise<ReleaseResponse> {
    return mockReleaseResponse(reservationId);
  }

  async extendReservation(
    reservationId: string,
    req: ReservationExtendRequest,
  ): Promise<ReservationExtendResponse> {
    return mockExtendResponse(reservationId, req);
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    return mockDecisionResponse(req);
  }

  async getBalances(params: Record<string, string>): Promise<BalanceResponse> {
    return mockBalanceResponse(params);
  }

  async listReservations(
    _params?: Record<string, string>,
  ): Promise<ReservationListResponse> {
    return mockReservationListResponse();
  }

  async getReservation(reservationId: string): Promise<ReservationDetail> {
    return mockReservationDetail(reservationId);
  }

  async createEvent(req: EventCreateRequest): Promise<EventCreateResponse> {
    return mockEventCreateResponse(req);
  }
}

export function createAdapter(): ClientAdapter {
  if (process.env.CYCLES_MOCK === "true") {
    return new MockClientAdapter();
  }
  return new RealClientAdapter();
}
