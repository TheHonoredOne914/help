import { Suspense } from "react";
import { BotHandoff, pageTitle } from "@/components/bot-handoff";
import { OrderView } from "@/components/order-view";
import { Skeleton } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Container, PageHeader } from "@/components/ui";
import { SiteOrderStatus } from "@/components/site-order-status";
import { anyChargeReady } from "@/lib/payments/ready";
import { getServerEnv } from "@/lib/server/env";

export const metadata = pageTitle("Оплата на сайте готовится", "Оплата заказа");

export default function CheckoutPage({ params }: PageProps<"/checkout/[orderId]">) {
  if (getServerEnv().siteMode === "public" && anyChargeReady()) {
    return (
      <>
        <PageHeader eyebrow="Оплата" title="Статус заказа" lead="Статус читается на сервере. Ссылка возврата оплату не доказывает." />
        <Container className="max-w-3xl py-14">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Ready params={params} />
          </Suspense>
        </Container>
      </>
    );
  }
  if (getServerEnv().siteMode === "public") {
    return (
      <BotHandoff
        eyebrow="Оплата"
        title="Оплата на сайте готовится"
        lead="Оплата на сайте готовится. Сейчас оформить подписку можно в Telegram."
        action="Оформить в Telegram"
      />
    );
  }
  return (
    <>
      <PageHeader eyebrow="Оплата" title="Оплата заказа" />
      <Container className="max-w-3xl py-14">
        <PaymentSteps current={2} />
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Checkout params={params} />
        </Suspense>
      </Container>
    </>
  );
}

async function Ready({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <SiteOrderStatus orderId={orderId} />;
}

async function Checkout({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <OrderView orderId={orderId} mode="checkout" />;
}
