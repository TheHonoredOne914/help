import { Suspense } from "react";
import { BotHandoff, pageTitle } from "@/components/bot-handoff";
import { MissingOrder } from "@/components/missing-order";
import { PaymentOutcome } from "@/components/payment-outcome";
import { Skeleton } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Container, PageHeader } from "@/components/ui";
import { getServerEnv } from "@/lib/server/env";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata = pageTitle("Оплата на сайте готовится", "Оплата не прошла");

export default function PaymentErrorPage({ searchParams }: PageProps<"/payment/error">) {
  if (getServerEnv().siteMode === "public") {
    return (
      <BotHandoff
        eyebrow="Оплата"
        title="Оплата на сайте готовится"
        lead="Оплата на сайте готовится. Сейчас оформить подписку можно в Telegram."
        action="Открыть бота"
      />
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Оплата"
        title="Оплата не завершена"
        lead="Подписка выдаётся только после подтверждённой оплаты. Статус ниже проверен у платёжного сервиса."
      />
      <Container className="max-w-3xl py-14">
        <PaymentSteps current={4} failed />
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Outcome searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function Outcome({ searchParams }: { searchParams: SearchParams }) {
  const orderId = firstParam((await searchParams).orderId);
  return orderId ? <PaymentOutcome orderId={orderId} expected="error" /> : <MissingOrder />;
}
