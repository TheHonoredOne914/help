import { Traffic } from "@/components/home/blocks";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";

export async function generateMetadata() {
  const d = dictionary(await getLocale());
  return { title: d.nav.features, description: d.traffic.lead };
}

export default function FeaturesPage() {
  return <Traffic />;
}
