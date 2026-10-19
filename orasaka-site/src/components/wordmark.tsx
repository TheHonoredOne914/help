import Image from "next/image";
import { brand } from "@/config/brand";

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  if (brand.logo) {
    const { src, width, height, alt } = brand.logo;
    return <Image src={src} width={width} height={height} alt={alt} className={size === "lg" ? "h-12 w-auto" : "h-8 w-auto"} />;
  }
  const text = size === "lg" ? "text-2xl" : "text-[15px] tracking-[0.04em] sm:text-lg sm:tracking-[0.08em]";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-[6px] border border-accent/60 bg-accent/10 font-display text-[11px] font-bold text-accent"
      >
        O
      </span>
      <span className={`whitespace-nowrap font-display font-bold ${text}`}>
        {brand.wordmark.primary}
        <span className="ml-1.5 text-accent">{brand.wordmark.secondary}</span>
      </span>
      <span lang="ja" aria-hidden="true" className="hidden text-[11px] tracking-widest text-muted md:inline">
        {brand.wordmark.kana}
      </span>
    </span>
  );
}
