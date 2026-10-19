import type { Metadata } from "next";
import { Suspense } from "react";
import { MissingOrder } from "@/components/missing-order";
import { OrderView } from "@/components/order-view";
import { Skeleton } from "@/components/states";
import { Container, PageHeader } from "@/components/ui";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Возврат с оплаты" };

export default function PaymentReturnPage({ searchParams }: PageProps<"/payment/return">) {
  return (
    <>
      <PageHeader
        eyebrow="Оплата"
        title="Проверяем статус оплаты"
        lead="Статус берётся только с сервера. Параметры адреса после возврата со страницы оплаты не подтверждают платёж."
      />
      <Container className="max-w-3xl py-14">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ReturnStatus searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function ReturnStatus({ searchParams }: { searchParams: SearchParams }) {
  // Only orderId is read; any status/success query is ignored by design.
  const orderId = firstParam((await searchParams).orderId);
  return orderId ? <OrderView orderId={orderId} mode="return" /> : <MissingOrder />;
}
