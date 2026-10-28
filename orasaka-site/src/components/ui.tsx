"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useDict } from "./locale-provider";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex select-none items-center justify-center gap-1.5 font-mono font-bold transition-[transform,box-shadow,border-color,background-color] duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50";

const sizes = {
  header: "min-h-[42px] rounded-[12px] px-5 py-2.5 text-[14px] leading-[22.4px]",
  hero: "min-h-[55px] rounded-[14px] px-7 py-[14px] text-[15px] leading-6",
  plan: "min-h-0 rounded-[12px] px-[11px] py-[11px] text-[14px] leading-[22.4px]",
  md: "min-h-[52px] rounded-[14px] px-7 py-3.5 text-[15px] leading-6",
};

const variants: Record<Variant, string> = {
  primary:
    "btn-solid border-0 bg-[linear-gradient(135deg,#e5231b,#8c0f0f,#ff4433)] text-white shadow-[0_10px_28px_-16px_rgb(229_35_27/0.9)]",
  secondary: "border-[1.5px] border-white/14 bg-white/[0.06] text-white hover:border-white/30",
  ghost: "min-h-11 rounded-md bg-transparent px-3 text-muted hover:translate-y-0 hover:text-fg",
};

export function buttonClass(variant: Variant = "primary", extra = "", size: keyof typeof sizes = "md") {
  return `${base} ${sizes[size]} ${variants[variant]} ${extra}`;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "header" | "hero" | "plan" | "md" }) {
  return <Link className={buttonClass(variant, className, size)} {...props} />;
}

export function ExternalButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ComponentProps<"a"> & { variant?: Variant; size?: "header" | "hero" | "plan" | "md" }) {
  const dict = useDict();
  return (
    <a className={buttonClass(variant, className, size)} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
      <span className="sr-only"> ({dict.a11y.newTab})</span>
    </a>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "header" | "hero" | "plan" | "md" }) {
  return <button type="button" className={buttonClass(variant, className, size)} {...props} />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-accent">{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  id,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  id?: string;
}) {
  return (
    <div className="mb-10 max-w-[640px]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="h2 text-balance">
        {title}
      </h2>
      {lead ? <p className="mt-4 max-w-[560px] text-base leading-[1.6] text-muted text-pretty">{lead}</p> : null}
    </div>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-[20px] border border-white/10 bg-white/[0.03] p-7 ${className}`} {...props} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "pending" | "success" | "danger" | "test";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-line text-muted",
    pending: "border-warning/50 text-warning",
    success: "border-success/50 text-success",
    danger: "border-accent/60 text-accent",
    test: "border-warning/60 bg-warning/10 text-warning",
  };
  const icons = { neutral: "•", pending: "◷", success: "✓", danger: "✕", test: "⚠" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider ${tones[tone]}`}
    >
      <span aria-hidden="true">{icons[tone]}</span>
      {children}
    </span>
  );
}

export function Container({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`mx-auto w-full max-w-[1120px] px-6 ${className}`} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  lead,
  aside,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  /** Optional decoration beside the heading (e.g. the compact heroine); hidden on phones. */
  aside?: React.ReactNode;
}) {
  return (
    <header className="relative">
      <Container className="flex items-end justify-between gap-10 pb-10 pt-16 sm:pt-20">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="h1 text-balance">{title}</h1>
          {lead ? <p className="mt-4 max-w-[560px] text-base leading-[1.6] text-muted">{lead}</p> : null}
        </div>
        {aside ? <div className="hidden lg:block">{aside}</div> : null}
      </Container>
    </header>
  );
}
