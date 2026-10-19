import type { Metadata } from "next";
import { Suspense } from "react";
import { MockGateway } from "@/components/mock-gateway";
import { Skeleton } from "@/components/states";
import { Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Тестовый платёжный шлюз (DEMO)" };

export default function MockPayPage({ params }: PageProps<"/pay/mock/[paymentId]">) {
  return (
    <>
      <PageHeader
        eyebrow="DEMO-шлюз"
        title="Тестовый платёжный шлюз"
        lead="Имитация страницы платёжного сервиса. В рабочем режиме здесь будет страница ЮKassa или другого провайдера."
      />
      <Container className="max-w-2xl py-14">
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
