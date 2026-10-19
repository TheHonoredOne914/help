import Image from "next/image";
import Link from "next/link";
import { BannerFigure } from "@/components/banner-figure";
import { FaqList } from "@/components/faq-list";
import { Hero } from "@/components/home/hero";
import { Reveal, SectionRule } from "@/components/motion";
import { PlansGrid } from "@/components/plans-grid";
import { PlatformIcon } from "@/components/platform-icon";
import { ButtonLink, Container, ExternalButton, SectionHeading } from "@/components/ui";
import { banners, brand } from "@/config/brand";
import { devices, faqHighlights, features, sections, steps } from "@/config/content";

export default function HomePage() {
  return (
    <>
      <Hero />

      <section aria-labelledby="features-title" className="pt-20 pb-20 sm:pt-24 sm:pb-24">
        <SectionRule index="01" />
        <Container className="mt-10">
          <SectionHeading id="features-title" eyebrow="Возможности" title="Что входит в подписку" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <Reveal
                as="li"
                key={f.code}
                delay={i * 0.06}
                className="group relative overflow-hidden rounded-xl border border-line bg-surface p-6 transition-[border-color,transform] duration-200 hover:-translate-y-1 hover:border-accent/60"
              >
                <span aria-hidden="true" className="font-mono text-xs text-accent">
                  /{f.code}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
                <span aria-hidden="true" className="absolute -right-10 -top-10 size-24 rounded-full bg-accent/0 opacity-0 blur-2xl transition-opacity duration-300 group-hover:bg-accent/30 group-hover:opacity-100" />
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="sections-title" className="border-y border-line bg-surface/30 py-20 sm:py-24">
        <SectionRule index="02" />
        <Container className="mt-10">
          <SectionHeading id="sections-title" eyebrow="Разделы" title="Мир ORASAKA" lead="Всё, что нужно для подключения, — в одном месте." />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {sections.map((s, i) => (
              <Reveal as="li" key={s.href} delay={i * 0.06} className={i < 2 ? "lg:col-span-3" : "lg:col-span-2"}>
                <Link
                  href={s.href}
                  className="group block overflow-hidden rounded-xl border border-line bg-black transition-[border-color,transform] duration-200 hover:-translate-y-1 hover:border-accent/70"
                >
                  <div className="overflow-hidden">
                    <Image
                      src={s.image.src}
                      width={s.image.width}
                      height={s.image.height}
                      alt=""
                      sizes="(min-width: 1024px) 600px, (min-width: 640px) 50vw, 100vw"
                      className="h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4">
                    <div>
                      <p className="font-display font-semibold">{s.title}</p>
                      <p className="text-sm text-muted">{s.text}</p>
                    </div>
                    <span aria-hidden="true" className="text-accent transition-transform duration-200 group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      <section id="tariffs" aria-labelledby="tariffs-title" className="py-20 sm:py-24">
        <SectionRule index="03" />
        <Container className="mt-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <SectionHeading
              id="tariffs-title"
              eyebrow="Тарифы"
              title="Сроки и цены — только с сервера"
              lead="Сайт показывает тарифы, которые возвращает сервер подписок. Пока подключение не настроено, актуальные условия — в боте."
            />
            <ButtonLink href="/pricing" variant="secondary" className="mb-10 self-start md:self-auto">
              Все условия
            </ButtonLink>
          </div>
          <PlansGrid />
        </Container>
      </section>

      <section aria-labelledby="devices-title" className="border-y border-line bg-surface/30 py-20 sm:py-24">
        <SectionRule index="04" />
        <Container className="mt-10 grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <SectionHeading
              id="devices-title"
              eyebrow="Устройства"
              title="Подключение через Happ"
              lead="По материалам бота подписка подключается на этих платформах. Лимит устройств зависит от тарифа."
            />
            <ul className="grid grid-cols-2 gap-3">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-4">
                  <PlatformIcon name={d.icon} className="size-6 shrink-0 text-accent" />
                  <div>
                    <p className="font-display font-semibold">{d.name}</p>
                    <p className="text-sm text-muted">{d.app}</p>
                  </div>
                </li>
              ))}
            </ul>
            <ButtonLink href="/devices" variant="secondary" className="mt-6">
              Подробнее об устройствах
            </ButtonLink>
          </Reveal>
          <Reveal delay={0.1}>
            <BannerFigure image={banners.devices} />
          </Reveal>
        </Container>
      </section>

      <section aria-labelledby="steps-title" className="py-20 sm:py-24">
        <SectionRule index="05" />
        <Container className="mt-10">
          <SectionHeading id="steps-title" eyebrow="Подключение" title="Три шага до подключения" />
          <ol className="relative grid gap-4 md:grid-cols-3">
            <span aria-hidden="true" className="absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-accent/0 via-accent/50 to-accent/0 md:block" />
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.1} className="relative rounded-xl border border-line bg-bg p-6">
                <span aria-hidden="true" className="relative grid size-12 place-items-center rounded-lg border border-accent/60 bg-accent/10 font-display text-lg font-bold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">
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

      <section aria-labelledby="faq-title" className="border-y border-line bg-surface/30 py-20 sm:py-24">
        <SectionRule index="06" />
        <Container className="mt-10 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionHeading id="faq-title" eyebrow="FAQ" title="Частые вопросы" />
            <ButtonLink href="/faq" variant="secondary">
              Все вопросы
            </ButtonLink>
          </div>
          <FaqList items={faqHighlights} />
        </Container>
      </section>

      <section aria-labelledby="support-title" className="pt-20 sm:pt-24">
        <Container>
          <Reveal className="relative grid items-center gap-10 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-surface to-bg p-6 sm:p-12 lg:grid-cols-2">
            <div aria-hidden="true" className="glow-lg absolute -right-20 -top-20 size-80 rounded-full bg-accent/20 blur-3xl" />
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
