import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderView } from "@/components/order-view";
import { Skeleton } from "@/components/states";
import { PaymentSteps } from "@/components/payment-steps";
import { Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Оплата заказа" };

export default function CheckoutPage({ params }: PageProps<"/checkout/[orderId]">) {
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

async function Checkout({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <OrderView orderId={orderId} mode="checkout" />;
}
