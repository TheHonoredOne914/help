import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { Container, PageHeader } from "./ui";

export async function LegalDraft({ title, sections }: { title: string; sections: { heading: string; body: string }[] }) {
  const legal = dictionary(await getLocale()).legal;
  return (
    <>
      <PageHeader eyebrow={legal.eyebrow} title={title} />
      <Container className="py-14">
        <p role="note" className="mb-6 max-w-3xl rounded-xl border border-white/15 p-4 text-sm text-muted">{legal.original}</p>
        <div role="note" className="mb-10 max-w-3xl rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm leading-relaxed text-warning">
          <p className="font-semibold">{legal.draftTitle}</p>
          <p className="mt-1">{legal.draftBody}</p>
        </div>
        <article className="max-w-3xl space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-lg font-semibold">{s.heading}</h2>
              <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
            </section>
          ))}
        </article>
      </Container>
    </>
  );
}

