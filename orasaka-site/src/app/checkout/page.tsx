import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutForm } from "@/components/checkout-form";
import { LoadingCards } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Container, PageHeader } from "@/components/ui";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Оформление подписки" };

export default function CheckoutStartPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <>
      <PageHeader
        eyebrow="Оплата"
        title="Оформление подписки"
        lead="Выберите срок и способ оплаты. Заказ создаётся на сервере, сумма фиксируется в нём."
      />
      <Container className="py-14">
        <PaymentSteps current={1} />
        <Suspense fallback={<LoadingCards label="Загружаем условия…" />}>
          <Checkout searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function Checkout({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return <CheckoutForm initialPlan={firstParam(sp.plan)} renew={firstParam(sp.renew) === "1"} />;
}
