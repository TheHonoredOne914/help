import { Suspense } from "react";
import { CheckoutForm } from "@/components/checkout-form";
import { LoadingCards } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Card, Container, PageHeader } from "@/components/ui";
import { PublicPay } from "@/components/public-pay";
import { brand } from "@/config/brand";
import { quotePlan } from "@/lib/catalog";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { formatMoney } from "@/lib/money";
import { monthsLabel } from "@/lib/months";
import { anyChargeReady, cryptoChargeReady, cryptoStandNote, paymentReadiness, paymentsStandNote } from "@/lib/payments/ready";
import { SESSION_COOKIE } from "@/lib/server/bff";
import { getStore } from "@/lib/server/db";
import { getServerEnv } from "@/lib/server/env";
import { readSession, requestNow } from "@/lib/server/store";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { firstParam, type SearchParams } from "@/lib/search-params";

export async function generateMetadata() {
  const d = dictionary(await getLocale());
  return { title: d.checkout.title, description: d.checkout.lead };
}

export default async function CheckoutStartPage({ searchParams }: PageProps<"/checkout">) {
  const d = dictionary(await getLocale());
  const ready = anyChargeReady();
  if (getServerEnv().siteMode === "public" && !ready) {
    return (
      <>
        <PageHeader eyebrow={d.checkout.eyebrow} title={d.checkout.offTitle} lead={d.checkout.offNow} />
        <Container className="py-14">
          <Card>
            <a className="inline-flex min-h-11 items-center rounded-[12px] bg-[linear-gradient(135deg,#e5231b,#8c0f0f,#ff4433)] px-5 font-mono text-sm font-bold text-white" href={brand.telegramBot.url}>
              {d.checkout.offCta}
            </a>
          </Card>
        </Container>
      </>
    );
  }
  if (getServerEnv().siteMode === "public") {
    return (
      <>
        <PageHeader eyebrow={d.checkout.eyebrow} title={d.checkout.title} lead={d.checkout.lead} />
        <Container className="py-14">
          <Suspense fallback={<LoadingCards label={d.checkout.loading} />}>
            <PublicCheckout searchParams={searchParams} />
          </Suspense>
        </Container>
      </>
    );
  }
  return (
    <>
      <PageHeader eyebrow={d.checkout.eyebrow} title={d.checkout.title} lead={d.checkout.lead} />
      <Container className="py-14">
        <PaymentSteps current={1} />
        <Suspense fallback={<LoadingCards label={d.checkout.loading} />}>
          <Checkout searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function PublicCheckout({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const locale = await getLocale();
  const d = dictionary(locale);
  const planId = firstParam((await searchParams).plan) ?? "";
  const plan = quotePlan(planId);
  const account = readSession(getStore(), (await cookies()).get(SESSION_COOKIE)?.value ?? "", requestNow());
  if (!account) {
    const next = `/checkout?plan=${encodeURIComponent(planId)}`;
    return (
      <Card>
        <p>
          {d.checkout.login}{" "}
          <a className="text-fg underline" href={`/login?next=${encodeURIComponent(next)}`}>
            {d.checkout.loginCta}
          </a>
        </p>
      </Card>
    );
  }
  if (!plan) return <Card><p>{d.checkout.missing}</p></Card>;
  const methods = paymentReadiness();
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">{monthsLabel(plan.months, locale)}</h2>
      <p className="mt-3 text-2xl font-semibold">{formatMoney({ amountMinor: plan.amountMinor, currency: "RUB" })}</p>
      {paymentsStandNote() ? <p className="mt-3 text-sm text-muted">{paymentsStandNote()}</p> : null}
      {cryptoStandNote() ? <p className="mt-3 text-sm text-muted">{cryptoStandNote()}</p> : null}
      <PublicPay planId={plan.id} yookassa={methods.yookassa} cryptopay={methods.cryptopay} cryptoOn={cryptoChargeReady()} />
    </Card>
  );
}

async function Checkout({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return <CheckoutForm initialPlan={firstParam(sp.plan)} renew={firstParam(sp.renew) === "1"} />;
}
