import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { buildCabinet, resolvedVpnRef, type CabinetView } from "@/lib/cabinet-view";
import { getLocale } from "@/lib/i18n/get-locale";
import { SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { siteProfile } from "@/lib/server/profile";
import { listOrderPage, readSession, requestNow } from "@/lib/server/store";
import { telegramMode } from "@/lib/server/telegram-mode";
import type { TelegramUi } from "@/lib/telegram-ui";
import { currentAdapter } from "@/lib/vpn/http-adapter";

export type LoadedCabinet = {
  view: CabinetView;
  telegram: TelegramUi;
  devMailbox: boolean;
  stand: boolean;
  canRevoke: boolean;
};

export async function loadCabinet(path: string, query?: { purchaseCursor?: string; orderCursor?: string }): Promise<LoadedCabinet> {
  await connection();
  const store = getStore();
  const now = requestNow();
  const account = readSession(store, (await cookies()).get(SESSION_COOKIE)?.value ?? "", now);
  if (!account) redirect(`/login?next=${encodeURIComponent(path)}`);
  const adapter = currentAdapter();
  const vpn = await adapter.readAccount(store, account);
  let view = buildCabinet(store, account, vpn, now, await getLocale());
  const orders = listOrderPage(store, account.id, query?.orderCursor ?? null);
  view = { ...view, orders: orders.rows, orderNext: orders.next, orderPrev: orders.prev, orderAt: orders.at };
  const purchaseCursor = query?.purchaseCursor;
  if (purchaseCursor) {
    const ref = resolvedVpnRef(account, vpn);
    view = { ...view, purchaseAt: purchaseCursor };
    if (!ref || !adapter.listPurchases) {
      view = { ...view, botPurchasesError: true };
    } else {
      const page = await adapter.listPurchases(ref, purchaseCursor);
      view = page.ok
        ? { ...view, botPurchases: page.items, purchaseCursor: page.cursor, purchasePrev: page.prev, botPurchasesError: false, botBoundary: page.boundary }
        : { ...view, botPurchasesError: true };
    }
  }
  return {
    view,
    telegram: telegramMode(),
    devMailbox: siteProfile() === "isolated" && envGet("MAIL_MODE") === "dev",
    stand: adapter.label === "contract-stand",
    canRevoke: adapter.label === "contract-stand" && typeof adapter.revokeDevice === "function",
  };
}
