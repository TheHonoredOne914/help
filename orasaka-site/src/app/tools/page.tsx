import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { fill } from "@/lib/i18n/locale";

export async function generateMetadata() {
  const d = dictionary(await getLocale());
  return { title: d.nav.tools, description: d.connect.lead };
}

export default async function ToolsPage() {
  const d = dictionary(await getLocale());
  const tools = [
    { href: "/account", title: d.nav.account, text: d.faq.enterA },
    { href: "/connect", title: d.nav.connect, text: d.tech.clientsText },
    { href: "/support", title: d.nav.support, text: fill(d.support.lead, { bot: brand.telegramBot.handle }) },
  ];
  return (
    <>
      <PageHeader eyebrow={d.nav.tools} title={d.nav.tools} lead={d.tech.lead} />
      <Container className="grid gap-4 pb-16 md:grid-cols-3">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href} className="rounded-[20px] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="font-mono text-lg font-bold">{tool.title}</h2>
            <p className="mt-2 text-sm text-muted">{tool.text}</p>
          </Link>
        ))}
      </Container>
    </>
  );
}
