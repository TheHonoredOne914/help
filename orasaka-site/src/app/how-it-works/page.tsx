import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";

export async function generateMetadata() {
  const d = dictionary(await getLocale());
  return { title: d.nav.how, description: d.tech.lead };
}

export default async function HowPage() {
  const d = dictionary(await getLocale());
  const steps = [
    { href: "/pricing", title: d.price.title, text: d.price.ruleFull },
    { href: "/checkout", title: d.checkout.title, text: d.faq.buyOff },
    { href: "/connect", title: d.tech.clients, text: d.tech.clientsText },
    { href: brand.telegramBot.url, title: d.support.title, text: d.support.writeLead },
  ];
  return (
    <>
      <PageHeader eyebrow={d.nav.how} title={d.tech.title} lead={d.tech.lead} />
      <Container className="grid gap-4 pb-16 md:grid-cols-2">
        {steps.map((step, index) => (
          <Link key={step.href} href={step.href} className="rounded-[20px] border border-white/10 bg-white/[0.04] p-6">
            <p className="font-mono text-xs text-accent">0{index + 1}</p>
            <h2 className="mt-2 font-mono text-lg font-bold">{step.title}</h2>
            <p className="mt-2 text-sm text-muted">{step.text}</p>
          </Link>
        ))}
      </Container>
    </>
  );
}
