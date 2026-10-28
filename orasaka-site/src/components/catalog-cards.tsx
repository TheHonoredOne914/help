import { CATALOG } from "@/lib/catalog";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { PlanBoard } from "./plan-board";

/** Confirmed prices. Checkout itself decides whether a charge can start. */
export async function CatalogCards() {
  const locale = await getLocale();
  const d = dictionary(locale).price;
  return (
    <PlanBoard
      locale={locale}
      plans={CATALOG.map((plan) => ({ id: plan.id, months: plan.months, amountMinor: plan.amountMinor, saveMinor: plan.saveMinor }))}
      copy={{
        full: d.full,
        noauto: d.noauto,
        server: d.server,
        save: d.save,
        month: d.month,
        buy: d.buy,
        viewFull: d.viewFull,
        viewMonth: d.viewMonth,
        perMonth: d.perMonth,
        willCharge: d.willCharge,
      }}
    />
  );
}
