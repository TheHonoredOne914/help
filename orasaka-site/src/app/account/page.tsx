import { Suspense } from "react";
import { pageTitle } from "@/components/bot-handoff";
import { Cabinet } from "@/components/cabinet";
import { CabinetShell } from "@/components/cabinet-shell";
import { DemoAccountPage } from "@/components/demo-account";
import { LoadingCards } from "@/components/states";
import { Container } from "@/components/ui";
import { loadCabinet } from "@/lib/account/load";
import { getServerEnv } from "@/lib/server/env";

export const metadata = pageTitle("Личный кабинет", "Личный кабинет");

async function PublicAccount() {
  const loaded = await loadCabinet("/account");
  return (
    <CabinetShell title="Личный кабинет" path="/account" stand={loaded.stand}>
      <Cabinet view={loaded.view} />
    </CabinetShell>
  );
}

export default function AccountPage() {
  if (getServerEnv().siteMode !== "public") return <DemoAccountPage />;
  return (
    <Suspense fallback={<Container className="py-14"><LoadingCards label="Загружаем кабинет…" /></Container>}>
      <PublicAccount />
    </Suspense>
  );
}
