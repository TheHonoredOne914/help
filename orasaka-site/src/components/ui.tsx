import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold tracking-wide transition-[background-color,border-color,color,box-shadow,translate,scale] duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97] active:duration-75 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "btn-shine bg-accent-strong text-white shadow-[0_0_22px_-8px_rgb(229_9_20/0.75)] hover:bg-[#e00b16] hover:shadow-[0_0_0_1px_rgb(255_32_53/0.45),0_10px_34px_-10px_rgb(229_9_20/0.9)]",
  secondary:
    "btn-shine border border-line bg-surface/90 text-fg hover:border-brand/80 hover:bg-surface-2 hover:shadow-[0_8px_28px_-14px_rgb(229_9_20/0.8)]",
  ghost: "text-muted hover:text-fg",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function ExternalButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: ComponentProps<"a"> & { variant?: Variant }) {
  return (
    <a className={buttonClass(variant, className)} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
      <span className="sr-only"> (откроется в новой вкладке)</span>
    </a>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-accent">
      <span aria-hidden="true" className="h-px w-8 bg-accent" />
      {children}
    </p>
  );
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
    <div className="mb-10 max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="font-display text-2xl font-bold leading-tight text-balance sm:text-3xl lg:text-4xl">
        {title}
      </h2>
      {lead ? <p className="mt-4 text-base leading-relaxed text-muted text-pretty">{lead}</p> : null}
    </div>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-xl border border-line bg-surface/80 p-6 ${className}`} {...props} />;
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
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`} {...props} />;
}

export function PageHeader({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="relative overflow-hidden border-b border-line">
      <div aria-hidden="true" className="grid-lines absolute inset-0" />
      <div
        aria-hidden="true"
        className="absolute -top-32 right-0 size-[28rem] rounded-full bg-accent/15 blur-3xl"
      />
      <Container className="relative py-14 sm:py-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight text-balance sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        {lead ? <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{lead}</p> : null}
      </Container>
    </header>
  );
}
