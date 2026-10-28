import { CATALOG, catalogMoney } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { monthsLabel } from "@/lib/months";
import type { Dict } from "./dictionaries";
import { fill, type Locale } from "./locale";

export type FaqLink = { href: string; label: string };
export type FaqEntry = { q: string; a: string; link?: FaqLink };
export type FaqGroup = { id: string; title: string; items: FaqEntry[] };

export function localizedPriceLine(locale: Locale): string {
  return CATALOG.map((plan) => `${monthsLabel(plan.months, locale)} — ${formatMoney(catalogMoney(plan))}`).join(", ");
}

export function buildFaq(d: Dict, locale: Locale, buyOnSite: boolean, bot: string): FaqGroup[] {
  const f = d.faq;
  return [
    {
      id: "subscription",
      title: f.g1,
      items: [
        { q: f.costQ, a: fill(f.costA, { prices: localizedPriceLine(locale) }), link: { href: "/pricing", label: d.nav.pricing } },
        { q: f.buyQ, a: buyOnSite ? f.buyOn : f.buyOff },
        { q: f.renewQ, a: buyOnSite ? f.renewOn : f.renewOff },
      ],
    },
    {
      id: "connect",
      title: f.g2,
      items: [
        { q: f.appsQ, a: f.appsA, link: { href: "/connect", label: d.nav.connect } },
        { q: f.countryQ, a: f.countryA },
        { q: f.failQ, a: fill(f.failA, { bot }), link: { href: "/support", label: d.nav.support } },
      ],
    },
    {
      id: "payment",
      title: f.g3,
      items: [
        { q: f.payQ, a: buyOnSite ? f.payOn : f.payOff },
        { q: f.returnQ, a: f.returnA },
      ],
    },
    {
      id: "account",
      title: f.g4,
      items: [
        { q: f.enterQ, a: f.enterA },
        { q: f.shareQ, a: f.shareA },
      ],
    },
  ];
}
