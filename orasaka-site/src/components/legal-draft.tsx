import { Container, PageHeader } from "./ui";

export function LegalDraft({ title, sections }: { title: string; sections: { heading: string; body: string }[] }) {
  return (
    <>
      <PageHeader eyebrow="Документ · черновик" title={title} />
      <Container className="py-14">
        <div role="note" className="mb-10 max-w-3xl rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm leading-relaxed text-warning">
          <p className="font-semibold">Черновик, не является юридическим документом.</p>
          <p className="mt-1">
            Реквизиты не заполнены. Текст требует подготовки и проверки юристом до публикации сайта.
          </p>
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

