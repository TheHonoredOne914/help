import type { ReactNode } from "react";
import { Container } from "@/components/ui";
import { dictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { CabinetNav } from "./cabinet-nav";

export async function CabinetShell({
  title,
  path,
  stand,
  children,
}: {
  title: string;
  path: string;
  stand: boolean;
  children: ReactNode;
}) {
  const c = dictionary(await getLocale()).cabinet;
  return (
    <Container className="py-10">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-accent">{c.eyebrow}</p>
      <h1 className="mt-3 font-mono text-3xl font-extrabold sm:text-[40px] sm:leading-[46px]">{title || c.title}</h1>
      {stand ? (
        <p role="note" className="mt-4 rounded-[20px] border border-white/10 px-4 py-3 text-sm text-muted">
          {c.stand}
        </p>
      ) : null}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24">
          <CabinetNav current={path} />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
