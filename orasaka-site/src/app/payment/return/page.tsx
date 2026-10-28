import { Suspense } from "react";
import { BotHandoff, pageTitle } from "@/components/bot-handoff";
import { MissingOrder } from "@/components/missing-order";
import { OrderView } from "@/components/order-view";
import { Skeleton } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Container, PageHeader } from "@/components/ui";
import { SiteOrderStatus } from "@/components/site-order-status";
import { anyChargeReady } from "@/lib/payments/ready";
import { getServerEnv } from "@/lib/server/env";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata = pageTitle("Возврат не включает подписку", "Возврат с оплаты");

export default function PaymentReturnPage({ searchParams }: PageProps<"/payment/return">) {
  if (getServerEnv().siteMode === "public" && anyChargeReady()) {
    return (
      <>
        <PageHeader
          eyebrow="Оплата"
          title="Возврат не подтверждает оплату"
          lead="Возврат на эту страницу не подтверждает оплату. Сервер запрашивает статус у платёжного стенда."
        />
        <Container className="max-w-3xl py-14">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Ready searchParams={searchParams} />
          </Suspense>
        </Container>
      </>
    );
  }
  if (getServerEnv().siteMode === "public") {
    return (
      <BotHandoff
        eyebrow="Оплата"
        title="Возврат не включает подписку"
        lead="Возврат на эту страницу подписку не включает. Оплата на сайте готовится. Сейчас оформить подписку можно в Telegram."
        action="Открыть бота"
      />
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Оплата"
        title="Проверяем статус оплаты"
        lead="Проверяем оплату у платёжного сервиса. Сам возврат со страницы оплаты ещё не подтверждает платёж."
      />
      <Container className="max-w-3xl py-14">
        <PaymentSteps current={3} />
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ReturnStatus searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function Ready({ searchParams }: { searchParams: SearchParams }) {
  const orderId = firstParam((await searchParams).orderId);
  return orderId ? <SiteOrderStatus orderId={orderId} returned /> : <MissingOrder />;
}

async function ReturnStatus({ searchParams }: { searchParams: SearchParams }) {
  // Only orderId is read; any status/success query is ignored by design.
  const orderId = firstParam((await searchParams).orderId);
  return orderId ? <OrderView orderId={orderId} mode="return" /> : <MissingOrder />;
}
