"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { monthsLabel } from "@/lib/months";
import type { Locale } from "@/lib/i18n/locale";
import { fill } from "@/lib/i18n/locale";
import { ButtonLink } from "./ui";

type Plan = { id: string; months: number; amountMinor: number; saveMinor: number };

function perMonthMinor(amountMinor: number, months: number): number {
  const whole = Math.floor(amountMinor / months);
  const rest = amountMinor % months;
  return rest * 2 >= months ? whole + 1 : whole;
}

export function PlanBoard({
  locale,
  plans,
  copy,
}: {
  locale: Locale;
  plans: Plan[];
  copy: {
    full: string;
    noauto: string;
    server: string;
    save: string;
    month: string;
    buy: string;
    viewFull: string;
    viewMonth: string;
    perMonth: string;
    willCharge: string;
  };
}) {
  const [monthly, setMonthly] = useState(false);
  return (
    <div>
      <div className="mx-auto mb-6 flex w-fit gap-1 rounded-full border border-white/12 p-1" role="group" aria-label={copy.viewFull}>
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={monthly === value}
            className={`rounded-full px-[22px] py-[9px] font-mono text-[13.5px] ${monthly === value ? "bg-white text-[#111]" : "text-muted"}`}
            onClick={() => setMonthly(value)}
          >
            {value ? copy.viewMonth : copy.viewFull}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const featured = plan.months === 1;
          const full = formatMoney({ amountMinor: plan.amountMinor, currency: "RUB" });
          const shown = monthly
            ? fill(copy.perMonth, { amount: formatMoney({ amountMinor: perMonthMinor(plan.amountMinor, plan.months), currency: "RUB" }) })
            : full;
          return (
            <li
              key={plan.id}
              data-cursor="card"
              className={`flex flex-col rounded-[20px] border px-6 py-[26px] ${featured ? "plan-hot border-transparent bg-white/[0.08]" : "border-white/10 bg-white/[0.04]"}`}
            >
              <h3 className="font-mono text-[19px] font-bold">{monthsLabel(plan.months, locale)}</h3>
              <p className="mt-4 font-mono text-[26px] font-extrabold leading-none">{shown}</p>
              <p className="mt-2 text-sm text-muted">
                {monthly
                  ? fill(copy.willCharge, { amount: full })
                  : plan.saveMinor > 0
                    ? fill(copy.save, { amount: formatMoney({ amountMinor: plan.saveMinor, currency: "RUB" }) })
                    : copy.month}
              </p>
              <ul className="mt-4 space-y-1 text-sm text-muted">
                <li>{copy.full}</li>
                <li>{copy.noauto}</li>
                <li>{copy.server}</li>
              </ul>
              <div className="mt-auto pt-5">
                <ButtonLink href={`/checkout?plan=${plan.id}`} variant={featured ? "primary" : "secondary"} size="plan" className={`w-full ${featured ? "buy-shine" : ""}`}>
                  {copy.buy}
                </ButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
