import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/order-status";

/*
 * Normalized BFF contract between the browser and Next.js route handlers.
 * These are the website's own shapes, not the FastAPI schema: the live client
 * must map verified FastAPI responses into them (see BACKEND_CHANGE_REQUEST.md).
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
  topUp: z.literal(false),
});

export const plansResponseSchema = z.object({
  plans: z.array(planSchema),
  capabilities: capabilitiesSchema,
  checkout: z.object({ mode: z.enum(["disabled", "mock"]) }),
});

export const orderSchema = z.object({
  id: z.string().min(1),
  planId: z.string(),
  planTitle: z.string(),
  amount: moneySchema,
  status: z.enum(ORDER_STATUSES),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  test: z.boolean(),
});

export const accountSchema = z.object({
  user: z.object({ displayName: z.string() }),
  subscription: z.object({
    status: z.enum(["none", "active", "expired"]),
    expiresAt: z.string().nullable(),
  }),
  provisioning: z.enum(["none", "pending", "ready", "failed"]),
  connection: z.object({ url: z.string() }).nullable(),
  devices: z
    .object({
      limit: z.number().int().nonnegative(),
      items: z.array(z.object({ id: z.string(), name: z.string(), lastSeenAt: z.string() })),
    })
    .nullable(),
  orders: z.array(orderSchema),
  test: z.boolean(),
});

export type Plan = z.infer<typeof planSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type PlansResponse = z.infer<typeof plansResponseSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Account = z.infer<typeof accountSchema>;

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
  backend_not_configured: 503,
  contract_unverified: 501,
};

export const API_ERROR_MESSAGE: Record<ApiErrorCode, string> = {
  unauthorized: "Нужно войти. Вход на сайте появится после подключения авторизации backend.",
  forbidden: "Нет доступа к этим данным.",
  not_found: "Не найдено.",
  conflict: "Данные изменились. Обновите страницу и проверьте условия.",
  rate_limited: "Слишком много запросов. Подождите немного и повторите.",
  timeout: "Сервер не ответил вовремя. Повторите попытку.",
  unavailable: "Сервис временно недоступен. Повторите попытку позже.",
  bad_request: "Некорректный запрос.",
  bad_response: "Сервер вернул неожиданный ответ.",
  payments_disabled: "Оплата на сайте отключена. Оформить подписку можно в Telegram-боте.",
  backend_not_configured: "Подключение к backend не настроено.",
  contract_unverified: "Интеграция с backend ещё не согласована.",
};
