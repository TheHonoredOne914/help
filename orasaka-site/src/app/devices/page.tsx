import type { Metadata } from "next";
import Link from "next/link";
import { BannerFigure } from "@/components/banner-figure";
import { Reveal } from "@/components/motion";
import { PlatformIcon } from "@/components/platform-icon";
import { ButtonLink, Card, Container, ExternalButton, PageHeader, SectionHeading } from "@/components/ui";
import { banners, brand } from "@/config/brand";

export const metadata: Metadata = { title: "Поддерживаемые устройства" };

const platforms = [
  { id: "android", name: "Android", icon: "android", apps: ["Happ", "V2RayTun"], source: "Официальный магазин приложений" },
  { id: "ios", name: "iOS / iPadOS", icon: "apple", apps: ["Happ", "V2RayTun"], source: "App Store" },
  { id: "windows", name: "Windows", icon: "windows", apps: ["Happ"], source: "Официальный сайт разработчика" },
  { id: "macos", name: "macOS", icon: "monitor", apps: ["Happ"], source: "Официальный источник разработчика" },
] as const;

const notes = [
  {
    title: "Одна подписка — несколько устройств",
    text: "Ссылка подписки импортируется в каждое приложение отдельно. Сколько устройств можно подключить, показывают бот и личный кабинет.",
  },
  {
    title: "Управление устройствами",
    text: "Список подключённых устройств и их отключение — в личном кабинете. Отключённое устройство теряет доступ, пока его не подключат снова.",
  },
  {
    title: "Другие клиенты",
    text: "Подойдут клиенты с импортом подписки по ссылке. Совместимость конкретного приложения уточняйте в поддержке.",
  },
];

export default function DevicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Устройства"
        title="Поддерживаемые устройства"
        lead="Телефон, планшет и компьютер — один ключ подписки, импорт в несколько касаний."
      />
      <Container className="py-14">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <ul className="grid gap-4 sm:grid-cols-2">
            {platforms.map((p, i) => (
              <Reveal as="li" key={p.id} delay={i * 0.05}>
                <Card className="group flex h-full flex-col transition-[border-color,transform] duration-200 hover:-translate-y-1 hover:border-accent/60">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-lg border border-line bg-bg text-accent transition-colors duration-200 group-hover:border-accent/60">
                      <PlatformIcon name={p.icon} />
                    </span>
                    <h2 className="font-display text-lg font-semibold">{p.name}</h2>
                  </div>
                  <p className="mt-4 text-sm text-muted">
                    Приложения: <span className="text-fg">{p.apps.join(", ")}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">Где взять: {p.source}</p>
                  <Link
                    href={`/connect#${p.id}`}
                    className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    Инструкция для {p.name.split(" ")[0]} →
                  </Link>
                </Card>
              </Reveal>
            ))}
          </ul>
          <BannerFigure image={banners.devices} />
        </div>

        <section aria-labelledby="devices-notes" className="mt-20">
          <SectionHeading id="devices-notes" eyebrow="Важно знать" title="Подключение и лимиты" />
          <ul className="grid gap-4 md:grid-cols-3">
            {notes.map((n, i) => (
              <Reveal as="li" key={n.title} delay={i * 0.05}>
                <Card className="h-full">
                  <h3 className="font-display font-semibold">{n.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{n.text}</p>
                </Card>
              </Reveal>
            ))}
          </ul>
          <p className="mt-6 text-xs text-muted">
            Ссылки на магазины приложений появятся после проверки официальных адресов — устанавливайте приложения только из
            официальных источников.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/connect">Пошаговое подключение</ButtonLink>
            <ButtonLink href="/account" variant="secondary">
              Мои устройства
            </ButtonLink>
            <ExternalButton href={brand.telegramBot.url} variant="ghost">
              Получить ключ в боте
            </ExternalButton>
          </div>
        </section>
      </Container>
    </>
  );
}
