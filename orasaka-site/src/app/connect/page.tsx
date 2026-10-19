import type { Metadata } from "next";
import { BannerFigure } from "@/components/banner-figure";
import { PlatformTabs } from "@/components/platform-tabs";
import { Card, Container, ExternalButton, PageHeader } from "@/components/ui";
import { banners, brand } from "@/config/brand";
import { platforms } from "@/config/platforms";

export const metadata: Metadata = { title: "Подключение" };

export default function ConnectPage() {
  return (
    <>
      <PageHeader
        eyebrow="Подключение"
        title="Как подключиться"
        lead="Ключ подписки выдаёт бот. Выберите платформу и следуйте шагам."
      />
      <Container className="py-14">
        <BannerFigure image={banners.connect} sizes="(min-width: 1280px) 1216px, 100vw" className="mb-12" />
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
          <PlatformTabs platforms={platforms} />
          <Card className="lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold">Где взять ключ</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Ссылка подписки находится в личном кабинете бота. Ссылки на приложения появятся здесь после проверки
              официальных адресов.
            </p>
            <ExternalButton href={brand.telegramBot.url} className="mt-5 w-full">
              Открыть {brand.telegramBot.handle}
            </ExternalButton>
          </Card>
        </div>
      </Container>
    </>
  );
}
