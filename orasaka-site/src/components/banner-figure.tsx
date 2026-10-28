import Image from "next/image";
import type { BrandImage } from "@/config/brand";

/** Banners carry baked-in text, so they are shown whole (object-contain) and treated as decoration. */
export function BannerFigure({
  image,
  sizes = "(min-width: 1024px) 560px, 100vw",
  className = "",
}: {
  image: BrandImage;
  sizes?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div aria-hidden="true" className="absolute -inset-4 rounded-3xl bg-accent/10 blur-2xl" />
      <div className="corner-frame relative overflow-hidden rounded-xl border border-line bg-black">
        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt={image.alt}
          sizes={sizes}
          loading="lazy"
          className="h-auto w-full object-contain"
        />
      </div>
    </div>
  );
}
