import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderView } from "@/components/order-view";
import { EmptyState, Skeleton } from "@/components/states";
import { ButtonLink, Container, PageHeader } from "@/components/ui";

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

async function ReturnStatus({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Only orderId is read; any status/success query is ignored by design.
  const raw = (await searchParams).orderId;
  const orderId = typeof raw === "string" ? raw : null;
  if (!orderId) {
    return (
      <EmptyState title="Номер заказа не указан">
        <p>Откройте заказ из личного кабинета или выберите тариф заново.</p>
        <div className="mt-5 flex justify-center">
          <ButtonLink href="/account">В кабинет</ButtonLink>
        </div>
      </EmptyState>
    );
  }
  return <OrderView orderId={orderId} mode="return" />;
}
