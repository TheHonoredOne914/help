import type { Metadata } from "next";
import { Suspense } from "react";
import { MissingOrder } from "@/components/missing-order";
import { PaymentOutcome } from "@/components/payment-outcome";
import { Skeleton } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Container, PageHeader } from "@/components/ui";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Оплата не прошла" };

export default function PaymentErrorPage({ searchParams }: PageProps<"/payment/error">) {
  return (
    <>
      <PageHeader
        eyebrow="Оплата"
        title="Оплата не завершена"
        lead="Подписка не выдаётся без подтверждённого платежа. Статус ниже перепроверен на сервере."
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
