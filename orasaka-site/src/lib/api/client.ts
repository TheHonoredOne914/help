import type {
  ApiResult,
  Capabilities,
  Connection,
  DevicesResponse,
  Order,
  Plan,
  Session,
  Subscription,
} from "./types";

export type DemoPreset = "empty" | "active" | "provisioning";

export const DEMO_PRESETS: { id: DemoPreset; label: string }[] = [
  { id: "empty", label: "Без подписки" },
  { id: "active", label: "Подписка активна" },
  { id: "provisioning", label: "Оплачено, доступ готовится" },
];

export type RequestContext = {
  /** Opaque server-side session id from the HttpOnly cookie; never a user id from the browser. */
  sessionId: string | null;
};

export type CreateOrderInput = { planId: string; idempotencyKey: string; paymentMethod: string };

/**
 * Website → backend boundary, grouped by domain. One implementation talks to
 * the existing FastAPI service (live-client.ts), the other is an isolated
 * in-memory demo (mock-client.ts). UI code never imports either directly.
 */
export interface OrasakaApiClient {
  readonly source: "mock" | "live";

  auth: {
    getSession(ctx: RequestContext): Promise<ApiResult<Session>>;
    /** Exchanges verified Telegram Login data for a backend session. */
    loginWithTelegram(payload: Record<string, string>): Promise<ApiResult<{ sessionId: string }>>;
    logout(ctx: RequestContext): Promise<ApiResult<null>>;
  };

  plans: {
    list(): Promise<ApiResult<{ plans: Plan[]; capabilities: Capabilities }>>;
  };

  orders: {
    create(ctx: RequestContext, input: CreateOrderInput): Promise<ApiResult<Order>>;
    get(ctx: RequestContext, orderId: string): Promise<ApiResult<Order>>;
    list(ctx: RequestContext): Promise<ApiResult<Order[]>>;
    cancel(ctx: RequestContext, orderId: string): Promise<ApiResult<Order>>;
  };

  subscription: {
    get(ctx: RequestContext): Promise<ApiResult<Subscription>>;
    renew(ctx: RequestContext, input: CreateOrderInput): Promise<ApiResult<Order>>;
  };

  connection: {
    getLink(ctx: RequestContext): Promise<ApiResult<Connection>>;
  };

  devices: {
    list(ctx: RequestContext): Promise<ApiResult<DevicesResponse>>;
    remove(ctx: RequestContext, deviceId: string): Promise<ApiResult<DevicesResponse>>;
  };
}
