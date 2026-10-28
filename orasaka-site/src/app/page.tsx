import { FaqList } from "@/components/faq-list";
import { DataWorth, Platforms, Protocols, Reasons, TelegramBand, Threats, Traffic, Visibility } from "@/components/home/blocks";
import { Hero } from "@/components/home/hero";
import { CatalogCards } from "@/components/catalog-cards";
import { ButtonLink } from "@/components/ui";
import { brand } from "@/config/brand";
import { dictionary } from "@/lib/i18n/dictionaries";
import { buildFaq } from "@/lib/i18n/faq";
import { getLocale } from "@/lib/i18n/get-locale";
import { anyChargeReady } from "@/lib/payments/ready";
import { getServerEnv } from "@/lib/server/env";

export default async function HomePage() {
  const locale = await getLocale();
  const d = dictionary(locale);
  const buyOnSite = getServerEnv().siteMode === "public" && anyChargeReady();
  const groups = buildFaq(d, locale, buyOnSite, brand.telegramBot.handle);
  const highlights = [
    groups[0].items[0],
    groups[0].items[1],
    groups[1].items[0],
    groups[2].items[0],
    groups[2].items[1],
    groups[3].items[1],
  ];
  return (
    <>
      <Hero />
      <Platforms />
      <TelegramBand />
      <Traffic />
      <Threats />
      <Visibility />
      <Reasons />
      <Protocols />
      <DataWorth />
      <section id="pricing" data-scene="pricing" aria-labelledby="tariffs-title" className="py-16">
        <div className="mx-auto box-border w-full max-w-[1120px] px-6">
          <h2 id="tariffs-title" className="h2 mx-auto text-center">{d.price.title}</h2>
          <p className="mx-auto mt-4 max-w-[640px] text-center text-muted">{buyOnSite ? d.price.leadOn : d.price.leadOff}</p>
          <div className="mt-8">
            <CatalogCards />
          </div>
        </div>
      </section>
      <section data-scene="faq" aria-labelledby="faq-title" className="pb-[72px] pt-14">
        <div className="mx-auto box-border w-full max-w-[1120px] px-6">
          <h2 id="faq-title" className="h2 mx-auto mb-8 text-center">{d.faq.title}</h2>
          <div className="mx-auto max-w-[760px]">
            <FaqList items={highlights} numbered prompt={d.faq.prompt} />
            <div className="mt-6 text-center">
              <ButtonLink href="/faq" variant="secondary" size="header">{d.faq.more}</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
