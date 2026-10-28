import type { PaymentMethod } from "@/lib/api/types";
import type { PaymentProviderAdapter } from "./types";

export type ProviderRegistry = {
  list(): PaymentProviderAdapter[];
  get(id: string): PaymentProviderAdapter | null;
};

/** Adding a provider = adding an adapter here; checkout UI reads the list and needs no changes. */
export function createRegistry(adapters: PaymentProviderAdapter[]): ProviderRegistry {
  const byId = new Map(adapters.map((a) => [a.id, a]));
  return { list: () => adapters, get: (id) => byId.get(id) ?? null };
}

export function listPaymentMethods(registry: ProviderRegistry): PaymentMethod[] {
  const methods: PaymentMethod[] = registry.list().map((a) => {
    const reason = a.disabledReason();
    return {
      id: a.id,
      label: a.label,
      description: reason ?? "Переход на страницу оплаты провайдера. Статус подтверждается сервером.",
      status: reason ? (a.id === "yookassa" ? "pending_integration" : "disabled") : "enabled",
      currencies: a.capabilities.currencies,
      test: a.id === "mock",
    };
  });
  methods.push({
    id: "telegram_stars",
    label: "Telegram Stars",
    description: "Оплата Stars доступна только внутри Telegram-бота по правилам Telegram.",
    status: "bot_only",
    currencies: ["XTR"],
    test: false,
  });
  return methods;
}
