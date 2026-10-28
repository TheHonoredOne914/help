import type { Metadata } from "next";
import { PlatformTabs } from "@/components/platform-tabs";
import { Card, Container, ExternalButton, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { fill } from "@/lib/i18n/locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale()).meta.connect };
}

export default async function ConnectPage() {
  const d = dictionary(await getLocale()).connect;
  const platforms = [
    { id: "android", name: d.android, steps: d.androidSteps },
    { id: "ios", name: d.ios, steps: d.iosSteps },
    { id: "windows", name: d.windows, steps: d.windowsSteps },
    { id: "macos", name: d.macos, steps: d.macosSteps },
    { id: "manual", name: d.manual, steps: d.manualSteps },
  ];
  return (
    <>
      <PageHeader eyebrow={d.eyebrow} title={d.title} lead={d.lead} />
      <Container className="py-14">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
          <PlatformTabs platforms={platforms} />
          <Card className="lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold">{d.keyTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">{d.keyText}</p>
            <ExternalButton href={brand.telegramBot.url} className="mt-5 w-full">
              {fill(d.open, { bot: brand.telegramBot.handle })}
            </ExternalButton>
          </Card>
        </div>
      </Container>
    </>
  );
}
