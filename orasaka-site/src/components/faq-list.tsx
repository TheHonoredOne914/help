import type { FaqItem } from "@/config/content";

export function FaqList({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-surface/60">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold transition-colors duration-150 hover:text-accent [&::-webkit-details-marker]:hidden">
            {item.q}
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full border border-line font-mono text-accent transition-transform duration-150 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="px-5 pb-5 leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
