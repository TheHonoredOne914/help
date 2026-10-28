import { Suspense } from "react";
import { pageTitle } from "@/components/bot-handoff";
import { CabinetShell } from "@/components/cabinet-shell";
import { SettingsCard } from "@/components/cabinet-sections";
import { LoadingCards } from "@/components/states";
import { Container } from "@/components/ui";
import { loadCabinet } from "@/lib/account/load";
import { getServerEnv } from "@/lib/server/env";
import { DemoAccountPage } from "@/components/demo-account";

export const metadata = pageTitle("Настройки", "Настройки");

async function Body() {
  const loaded = await loadCabinet("/account/settings");
  return (
    <CabinetShell title="Настройки" path="/account/settings" stand={loaded.stand}>
      <SettingsCard view={loaded.view} telegram={loaded.telegram} devMailbox={loaded.devMailbox} />
    </CabinetShell>
  );
}

export default function SettingsPage() {
  if (getServerEnv().siteMode !== "public") return <DemoAccountPage />;
  return (
    <Suspense fallback={<Container className="py-14"><LoadingCards label="Загружаем настройки…" /></Container>}>
      <Body />
    </Suspense>
  );
}
