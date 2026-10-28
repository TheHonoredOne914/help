import Image from "next/image";
import { brand } from "@/config/brand";

/** Fixed 42px mark box. Empty until brand.logo is a real PNG, so the nav does not shift when it arrives. */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-12" : "size-[42px]";
  const text = size === "lg" ? "text-2xl" : "text-[13px] tracking-[0.02em] min-[400px]:text-[15px] min-[400px]:tracking-[0.04em] sm:text-lg sm:tracking-[0.08em]";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 sm:gap-2.5">
      <span data-logo-slot="" className={`${brand.logo ? "grid" : "hidden md:grid"} shrink-0 place-items-center ${box}`}>
        {brand.logo ? (
          <Image src={brand.logo.src} width={brand.logo.width} height={brand.logo.height} alt={brand.logo.alt} className="max-h-full max-w-full object-contain" />
        ) : null}
      </span>
      <span className={`whitespace-nowrap font-display font-bold ${text}`}>
        {brand.wordmark.primary}{" "}
        <span className="ml-0.5 text-accent">{brand.wordmark.secondary}</span>
      </span>
      <span lang="ja" aria-hidden="true" className="kana hidden shrink-0 whitespace-nowrap text-[11px] tracking-widest text-muted md:inline">
        {brand.wordmark.kana}
      </span>
    </span>
  );
}
