import { INTL_LOCALE, type Locale } from "@/lib/i18n/locale";

export const CABINET_COPY = {
  none: "У вас пока нет подписки",
  preparing: "Продление оплачено, доступ готовится. Текущий срок и ссылка остаются.",
  firstPreparing: "Оплачено, доступ готовится",
  failed: "Оплаченный заказ не удалось выдать. Напишите в поддержку: повторная оплата того же заказа срок не удлиняет.",
  unavailable: "Состояние подписки временно недоступно. Повторите попытку.",
  unconfigured: "Состояние подписки недоступно: VPN API не подключён.",
  expired: "Подписка истекла",
  botPurchases: "Покупки в Telegram недоступны: API бота не подключён. Они не восстанавливаются по дате окончания подписки.",
  devices: "Список устройств недоступен: API не подключён.",
  online: "Статус онлайн недоступен.",
} as const;

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Never "0 дней". Under a day: hours, or «меньше суток». Default locale keeps the Russian wording. */
export function remainingLabel(expiresAt: string, now: number, locale: Locale = "ru"): string {
  const ms = Date.parse(expiresAt) - now;
  const hour = 60 * 60 * 1000;
  if (!(ms >= hour)) return locale === "en" ? "under a day" : locale === "ja" ? "1日未満" : "меньше суток";
  if (ms < 24 * hour) {
    const hours = Math.floor(ms / hour);
    if (locale === "en") return hours === 1 ? "1 hour" : `${hours} hours`;
    if (locale === "ja") return `${hours}時間`;
    return `${hours} ${plural(hours, "час", "часа", "часов")}`;
  }
  const days = Math.floor(ms / (24 * hour));
  if (locale === "en") return days === 1 ? "1 day" : `${days} days`;
  if (locale === "ja") return `${days}日`;
  return `${days} ${plural(days, "день", "дня", "дней")}`;
}

export function formatExpiry(iso: string, locale: Locale = "ru"): string {
  const formatted = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  const zone = locale === "ru" ? "МСК" : "MSK";
  return `${formatted} ${zone}`;
}
