import { Suspense } from "react";
import { BotHandoff, pageTitle } from "@/components/bot-handoff";
import { MockGateway } from "@/components/mock-gateway";
import { Skeleton } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Container, PageHeader } from "@/components/ui";
import { getServerEnv } from "@/lib/server/env";

export const metadata = pageTitle("Оплата на сайте готовится", "Тестовый платёжный шлюз (DEMO)");

export default function MockPayPage({ params }: PageProps<"/pay/mock/[paymentId]">) {
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
      <PageHeader
        eyebrow="DEMO-шлюз"
        title="Тестовый платёжный шлюз"
        lead="Имитация страницы платёжного сервиса. В рабочем режиме здесь будет страница ЮKassa или другого провайдера."
      />
      <Container className="max-w-2xl py-14">
        <PaymentSteps current={3} />
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Gateway params={params} />
        </Suspense>
      </Container>
    </>
  );
}

async function Gateway({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <MockGateway paymentId={paymentId} />;
}
