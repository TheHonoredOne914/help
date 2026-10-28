import Link from "next/link";
import type { FaqItem } from "@/config/content";

export function FaqList({ items, numbered = false, prompt = "guest@orasaka:~$ cat faq.md" }: { items: readonly FaqItem[]; numbered?: boolean; prompt?: string }) {
  return (
    <div className={numbered ? "overflow-hidden rounded-[20px] border border-white/10 bg-black/40" : "divide-y divide-white/10 rounded-[20px] border border-white/10 bg-white/[0.03]"}>
      {numbered ? <p className="border-b border-white/10 px-5 py-3 font-mono text-xs text-muted">{prompt}</p> : null}
      {items.map((item, index) => (
        <details key={item.q} className="group border-b border-white/10 last:border-b-0">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 px-5 py-4 font-mono text-[13.5px] leading-[21.6px] font-bold [&::-webkit-details-marker]:hidden">
            {numbered ? <span className="text-accent">{String(index + 1).padStart(2, "0")}</span> : null}
            <span className="flex-1 text-left">{item.q}</span>
            <span aria-hidden="true" className="text-accent transition-transform duration-200 group-open:rotate-90">
              →
            </span>
          </summary>
          <div className="faq-panel">
            <div>
              <p className="px-5 pb-5 pl-11 font-sans text-[12.5px] leading-5 text-muted">
                {item.a}{" "}
                {item.link ? (
                  <Link href={item.link.href} className="text-fg underline decoration-white/40 underline-offset-4">
                    {item.link.label}
                  </Link>
                ) : null}
              </p>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
