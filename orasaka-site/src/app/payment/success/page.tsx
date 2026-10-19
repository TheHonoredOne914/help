import type { Metadata } from "next";
import { Suspense } from "react";
import { MissingOrder } from "@/components/missing-order";
import { PaymentOutcome } from "@/components/payment-outcome";
import { Skeleton } from "@/components/states";
import { Container, PageHeader } from "@/components/ui";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Оплата подтверждена" };

export default function PaymentSuccessPage({ searchParams }: PageProps<"/payment/success">) {
  return (
    <>
      <PageHeader eyebrow="Оплата" title="Спасибо за оплату" lead="Статус ниже перепроверен на сервере." />
      <Container className="max-w-3xl py-14">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Outcome searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function Outcome({ searchParams }: { searchParams: SearchParams }) {
  const orderId = firstParam((await searchParams).orderId);
  return orderId ? <PaymentOutcome orderId={orderId} expected="success" /> : <MissingOrder />;
}
