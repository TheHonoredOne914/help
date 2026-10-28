"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { brand } from "@/config/brand";

/** Transparent heroine. The whole figure drifts a few pixels. Hair and face are not separate layers. */
export function BrandIllustration({ variant = "hero", className = "" }: { variant?: "hero" | "compact"; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const art = brand.heroine;
  const compact = variant === "compact";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      el.dataset.onscreen = String(entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <figure ref={ref} data-onscreen="false" className={`${compact ? "" : "heroine-float"} ${className}`}>
      <Image
        src={art.src}
        alt={art.alt}
        width={art.width}
        height={art.height}
        sizes={compact ? "144px" : "(min-width: 1024px) 420px, 80vw"}
        className={compact ? "h-36 w-auto object-contain" : "mx-auto h-[300px] w-auto max-w-full object-contain sm:h-[340px] lg:h-[520px]"}
      />
    </figure>
  );
}
