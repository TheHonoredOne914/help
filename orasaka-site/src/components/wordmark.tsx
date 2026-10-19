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
      <svg aria-hidden="true" viewBox="0 0 64 64" className="size-8 shrink-0">
        <path d="M14 8H50L56 14V50L50 56H14L8 50V14Z" fill="rgb(229 9 20 / 0.08)" stroke="#e50914" strokeWidth="3.5" />
        <path d="M20 20L44 30L33 33L29 45Z" fill="#ff2035" />
        <path d="M35 36L44 44" stroke="#f5f5f5" strokeWidth="3" strokeLinecap="square" />
      </svg>
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
