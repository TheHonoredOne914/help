export const ORDER_STATUSES = [
  "created",
  "awaiting_payment",
  "paid",
  "provisioning_pending",
  "active",
  "cancelled",
  "expired",
  "failed",
  "refund_pending",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StatusTone = "neutral" | "pending" | "success" | "danger";

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; description: string; tone: StatusTone; final: boolean }
> = {
  created: {
    label: "Заказ создан",
    description: "Заказ зарегистрирован, оплата ещё не начата.",
    tone: "neutral",
    final: false,
  },
  awaiting_payment: {
    label: "Не оплачен",
    description: "Ожидаем подтверждение оплаты от платёжного сервиса.",
    tone: "pending",
    final: false,
  },
  paid: {
    label: "Оплачен, доступ готовится",
    description: "Оплата подтверждена сервером. Подписка будет выдана автоматически.",
    tone: "pending",
    final: false,
  },
  provisioning_pending: {
    label: "Оплачен, доступ готовится",
    description: "Оплата подтверждена. Выдаём доступ — повторно платить не нужно.",
    tone: "pending",
    final: false,
  },
  active: {
    label: "Доступ активен",
    description: "Подписка выдана. Ссылка подключения доступна в кабинете.",
    tone: "success",
    final: true,
  },
  cancelled: {
    label: "Отменён",
    description: "Заказ отменён, подписка не выдавалась.",
    tone: "danger",
    final: true,
  },
  expired: {
    label: "Истёк",
    description: "Время на оплату истекло. Создайте новый заказ.",
    tone: "danger",
    final: true,
  },
  failed: {
    label: "Ошибка оплаты",
    description: "Платёж не прошёл. Деньги не списаны или будут возвращены провайдером.",
    tone: "danger",
    final: true,
  },
  refund_pending: {
    label: "Возврат в обработке",
    description: "Запрос на возврат принят и обрабатывается.",
    tone: "pending",
    final: false,
  },
  refunded: {
    label: "Возвращён",
    description: "Средства по заказу возвращены.",
    tone: "neutral",
    final: true,
  },
};

const RANK: Record<OrderStatus, number> = {
  created: 0,
  awaiting_payment: 1,
  paid: 2,
  provisioning_pending: 3,
  active: 4,
  refund_pending: 5,
  refunded: 6,
  cancelled: 4,
  expired: 4,
  failed: 4,
};

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ["awaiting_payment", "cancelled", "expired"],
  awaiting_payment: ["paid", "cancelled", "expired", "failed"],
  paid: ["provisioning_pending", "active", "refund_pending"],
  provisioning_pending: ["active", "refund_pending"],
  active: ["refund_pending"],
  refund_pending: ["refunded"],
  cancelled: [],
  expired: [],
  failed: [],
  refunded: [],
};

/** Applies an incoming status; stale or out-of-order events never roll a later state back. */
export function applyOrderStatus(current: OrderStatus, incoming: OrderStatus): OrderStatus {
  if (current === incoming) return current;
  if (!ALLOWED[current].includes(incoming)) return current;
  return RANK[incoming] >= RANK[current] ? incoming : current;
}

export function isPolling(status: OrderStatus): boolean {
  return status === "awaiting_payment" || status === "paid" || status === "provisioning_pending";
}
