import { Suspense } from "react";
import { pageTitle } from "@/components/bot-handoff";
import { CabinetShell } from "@/components/cabinet-shell";
import { SubscriptionCard } from "@/components/cabinet-sections";
import { LoadingCards } from "@/components/states";
import { Container } from "@/components/ui";
import { loadCabinet } from "@/lib/account/load";
import { DemoAccountPage } from "@/components/demo-account";
import { getServerEnv } from "@/lib/server/env";

export const metadata = pageTitle("Мои подписки", "Мои подписки");

async function Body() {
  const loaded = await loadCabinet("/account/subscriptions");
  return (
    <CabinetShell title="Мои подписки" path="/account/subscriptions" stand={loaded.stand}>
      <SubscriptionCard view={loaded.view} />
    </CabinetShell>
  );
}

export default function SubscriptionsPage() {
  if (getServerEnv().siteMode !== "public") return <DemoAccountPage />;
  return (
    <Suspense fallback={<Container className="py-14"><LoadingCards label="Загружаем подписку…" /></Container>}>
      <Body />
    </Suspense>
  );
}
