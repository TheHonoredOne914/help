import type { Account, ApiResult, Order, PlansResponse } from "./types";

export type DemoScenario = "active" | "provisioning" | "unpaid" | "none" | "unauthorized" | "error";

export const DEMO_SCENARIOS: { id: DemoScenario; label: string }[] = [
  { id: "active", label: "Доступ активен" },
  { id: "provisioning", label: "Оплачен, доступ готовится" },
  { id: "unpaid", label: "Заказ не оплачен" },
  { id: "none", label: "Нет подписки" },
  { id: "unauthorized", label: "Не выполнен вход" },
  { id: "error", label: "Ошибка backend" },
];

export type RequestContext = {
  /** Canonical user id resolved from the server-side session; never taken from the browser. */
  userId: string | null;
  demoScenario?: DemoScenario;
};

export interface OrasakaApiClient {
  listPlans(): Promise<ApiResult<Omit<PlansResponse, "checkout">>>;
  getAccount(ctx: RequestContext): Promise<ApiResult<Account>>;
  createOrder(
    ctx: RequestContext,
    input: { planId: string; idempotencyKey: string },
  ): Promise<ApiResult<Order>>;
  getOrder(ctx: RequestContext, orderId: string): Promise<ApiResult<Order>>;
  cancelOrder(ctx: RequestContext, orderId: string): Promise<ApiResult<Order>>;
}
