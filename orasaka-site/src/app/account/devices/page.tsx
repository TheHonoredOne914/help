import { Suspense } from "react";
import { pageTitle } from "@/components/bot-handoff";
import { CabinetShell } from "@/components/cabinet-shell";
import { DevicesCard } from "@/components/cabinet-sections";
import { LoadingCards } from "@/components/states";
import { Container } from "@/components/ui";
import { loadCabinet } from "@/lib/account/load";
import { getServerEnv } from "@/lib/server/env";
import { DemoAccountPage } from "@/components/demo-account";

export const metadata = pageTitle("Мои устройства", "Мои устройства");

async function Body() {
  const loaded = await loadCabinet("/account/devices");
  return (
    <CabinetShell title="Мои устройства" path="/account/devices" stand={loaded.stand}>
      <DevicesCard view={loaded.view} canRevoke={loaded.canRevoke} />
    </CabinetShell>
  );
}

export default function DevicesPage() {
  if (getServerEnv().siteMode !== "public") return <DemoAccountPage />;
  return (
    <Suspense fallback={<Container className="py-14"><LoadingCards label="Загружаем устройства…" /></Container>}>
      <Body />
    </Suspense>
  );
}
