import { Container, PageHeader } from "@/components/ui";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";

export async function generateMetadata() {
  const d = dictionary(await getLocale());
  return { title: d.nav.servers, description: d.faq.countryA };
}

export default async function ServersPage() {
  const d = dictionary(await getLocale());
  return (
    <>
      <PageHeader eyebrow={d.nav.servers} title={d.nav.servers} lead={d.faq.countryA} />
      <Container className="pb-16">
        <p className="max-w-[640px] text-muted">{d.vis.serverSub}</p>
      </Container>
    </>
  );
}
