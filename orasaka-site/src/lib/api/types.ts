import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/order-status";

/*
 * Normalized BFF contract between the browser and Next.js route handlers.
 * These are the website's own shapes, not the FastAPI schema: the live client
 * must map verified FastAPI responses into them (see API_CONTRACT.md).
 */

export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.enum(["RUB", "XTR"]),
});

export const planSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  durationMonths: z.number().int().positive(),
  prices: z.array(moneySchema).min(1),
  conditions: z.array(z.string()),
  test: z.boolean(),
});

export const capabilitiesSchema = z.object({
  trial: z.boolean(),
  referral: z.boolean(),
  devices: z.boolean(),
  renewal: z.boolean(),
  topUp: z.literal(false),
});

export const plansResponseSchema = z.object({
  plans: z.array(planSchema),
  capabilities: capabilitiesSchema,
});

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  user: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  demoLoginAvailable: z.boolean(),
});

export const orderSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["new", "renewal"]),
  planId: z.string(),
  planTitle: z.string(),
  amount: moneySchema,
  status: z.enum(ORDER_STATUSES),
  paymentMethod: z.string().nullable(),
  paymentStatus: z.enum(["pending", "succeeded", "canceled", "failed", "expired"]).nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  test: z.boolean(),
});

export const ordersResponseSchema = z.object({ orders: z.array(orderSchema) });

export const subscriptionSchema = z.object({
  status: z.enum(["none", "active", "expired"]),
  expiresAt: z.string().nullable(),
  planTitle: z.string().nullable(),
  provisioning: z.enum(["none", "pending", "ready", "failed"]),
  test: z.boolean(),
});

export const connectionSchema = z.object({ url: z.string(), test: z.boolean() });

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string(),
  lastSeenAt: z.string(),
});

export const devicesResponseSchema = z.object({
  limit: z.number().int().nonnegative(),
  items: z.array(deviceSchema),
});

export const PAYMENT_METHOD_STATUSES = ["enabled", "disabled", "pending_integration", "bot_only"] as const;

export const paymentMethodSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  status: z.enum(PAYMENT_METHOD_STATUSES),
  currencies: z.array(z.enum(["RUB", "XTR"])),
  test: z.boolean(),
});

export const paymentMethodsResponseSchema = z.object({
  mode: z.enum(["disabled", "mock"]),
  methods: z.array(paymentMethodSchema),
});

export const checkoutResponseSchema = z.object({
  order: orderSchema,
  checkoutUrl: z.string().nullable(),
});

export const mockGatewayPaymentSchema = z.object({
  providerPaymentId: z.string(),
  orderId: z.string(),
  amount: moneySchema,
  status: z.enum(["pending", "succeeded", "canceled"]),
  returnUrl: z.string(),
});

export type Plan = z.infer<typeof planSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type PlansResponse = z.infer<typeof plansResponseSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type DevicesResponse = z.infer<typeof devicesResponseSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "bad_request"
  | "bad_response"
  | "payments_disabled"
  | "method_unavailable"
  | "verification_failed"
  | "backend_not_configured"
  | "contract_unverified";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorCode };

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  timeout: 504,
  unavailable: 503,
  bad_request: 400,
  bad_response: 502,
  payments_disabled: 403,
  method_unavailable: 422,
  verification_failed: 502,
  backend_not_configured: 503,
  contract_unverified: 501,
};

export const API_ERROR_MESSAGE: Record<ApiErrorCode, string> = {
  unauthorized: "Нужно войти в аккаунт.",
  forbidden: "Нет доступа к этим данным.",
  not_found: "Не найдено.",
  conflict: "Данные изменились. Обновите страницу и проверьте условия.",
  rate_limited: "Слишком много запросов. Подождите немного и повторите.",
  timeout: "Сервер не ответил вовремя. Повторите попытку.",
  unavailable: "Сервис временно недоступен. Повторите попытку позже.",
  bad_request: "Некорректный запрос.",
  bad_response: "Сервер вернул неожиданный ответ.",
  payments_disabled: "Оплата на сайте отключена. Оформить подписку можно в Telegram-боте.",
  method_unavailable: "Этот способ оплаты сейчас недоступен.",
  verification_failed: "Не удалось подтвердить платёж у платёжного сервиса. Повторите проверку позже.",
  backend_not_configured: "Подключение к backend не настроено.",
  contract_unverified: "Интеграция с backend ещё не согласована.",
};

export const API_ERROR_CODES = Object.keys(API_ERROR_STATUS) as ApiErrorCode[];

/** Response header that tells the UI whether data came from the mock layer. */
export const SOURCE_HEADER = "x-orasaka-source";
export type DataSource = "mock" | "live";
