import { BannerFigure } from "@/components/banner-figure";
import { FaqList } from "@/components/faq-list";
import { Hero } from "@/components/home/hero";
import { Reveal } from "@/components/motion";
import { PlansGrid } from "@/components/plans-grid";
import { ButtonLink, Container, ExternalButton, SectionHeading } from "@/components/ui";
import { banners, brand } from "@/config/brand";
import { devices, features, steps } from "@/config/content";

export default function HomePage() {
  return (
    <>
      <Hero />

      <section aria-labelledby="features-title" className="py-20 sm:py-24">
        <Container>
          <SectionHeading id="features-title" eyebrow="Возможности" title="Что входит в подписку" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <Reveal as="li" key={f.code} delay={i * 0.05} className="group relative overflow-hidden rounded-xl border border-line bg-surface p-6 transition-colors duration-150 hover:border-accent/60">
                <span aria-hidden="true" className="font-mono text-xs text-accent">
                  /{f.code}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      <section id="tariffs" aria-labelledby="tariffs-title" className="border-y border-line bg-surface/30 py-20 sm:py-24">
        <Container>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <SectionHeading
              id="tariffs-title"
              eyebrow="Тарифы"
              title="Сроки и цены — только из бота"
              lead="Сайт показывает тарифы, которые возвращает сервер подписок. Пока подключение не настроено, актуальные условия — в боте."
            />
            <ButtonLink href="/pricing" variant="secondary" className="mb-10 self-start md:self-auto">
              Все условия
            </ButtonLink>
          </div>
          <PlansGrid />
        </Container>
      </section>

      <section aria-labelledby="devices-title" className="py-20 sm:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <SectionHeading
              id="devices-title"
              eyebrow="Устройства"
              title="Подключение через Happ"
              lead="По материалам бота подписка подключается на этих платформах. Лимит устройств зависит от тарифа и указывается в боте."
            />
            <ul className="grid grid-cols-2 gap-3">
              {devices.map((d) => (
                <li key={d.id} className="rounded-lg border border-line bg-surface px-4 py-4">
                  <p className="font-display font-semibold">{d.name}</p>
                  <p className="mt-1 text-sm text-muted">Приложение {d.app}</p>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <BannerFigure image={banners.devices} />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="steps-title" className="border-y border-line bg-surface/30 py-20 sm:py-24">
        <Container>
          <SectionHeading id="steps-title" eyebrow="Подключение" title="Три шага до подключения" />
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.08} className="relative rounded-xl border border-line bg-bg p-6">
                <span aria-hidden="true" className="font-display text-5xl font-extrabold text-accent/25">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold">
                  <span className="sr-only">Шаг {i + 1}. </span>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </Reveal>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <ExternalButton href={brand.telegramBot.url}>Открыть {brand.telegramBot.handle}</ExternalButton>
            <ButtonLink href="/connect" variant="secondary">
              Инструкции по платформам
            </ButtonLink>
          </div>
        </Container>
      </section>

      <section aria-labelledby="faq-title" className="py-20 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading id="faq-title" eyebrow="FAQ" title="Частые вопросы" />
          <FaqList />
        </Container>
      </section>

      <section aria-labelledby="support-title">
        <Container>
          <Reveal className="relative grid items-center gap-10 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-surface to-bg p-8 sm:p-12 lg:grid-cols-2">
            <div aria-hidden="true" className="absolute -right-20 -top-20 size-80 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative">
              <SectionHeading
                id="support-title"
                eyebrow="Поддержка"
                title="Поддержка — в Telegram"
                lead="Вопросы по подключению, оплате и технические проблемы решаются через бота."
              />
              <div className="flex flex-wrap gap-3">
                <ExternalButton href={brand.telegramBot.url}>Написать в поддержку</ExternalButton>
                <ButtonLink href="/support" variant="secondary">
                  Раздел поддержки
                </ButtonLink>
              </div>
            </div>
            <BannerFigure image={banners.support} className="relative" />
          </Reveal>
        </Container>
      </section>
    </>
  );
}
