import { Suspense } from "react";
import { pageTitle } from "@/components/bot-handoff";
import { CabinetShell } from "@/components/cabinet-shell";
import { OrdersCard } from "@/components/cabinet-sections";
import { LoadingCards } from "@/components/states";
import { Container } from "@/components/ui";
import { loadCabinet } from "@/lib/account/load";
import { getServerEnv } from "@/lib/server/env";
import { DemoAccountPage } from "@/components/demo-account";

export const metadata = pageTitle("История покупок", "История покупок");

async function Body({ searchParams }: { searchParams: Promise<{ cursor?: string; orders?: string }> }) {
  const query = await searchParams;
  const loaded = await loadCabinet("/account/orders", { purchaseCursor: query.cursor, orderCursor: query.orders });
  return (
    <CabinetShell title="История покупок" path="/account/orders" stand={loaded.stand}>
      <OrdersCard view={loaded.view} />
    </CabinetShell>
  );
}

export default function OrdersPage({ searchParams }: { searchParams: Promise<{ cursor?: string; orders?: string }> }) {
  if (getServerEnv().siteMode !== "public") return <DemoAccountPage />;
  return (
    <Suspense fallback={<Container className="py-14"><LoadingCards label="Загружаем покупки…" /></Container>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
