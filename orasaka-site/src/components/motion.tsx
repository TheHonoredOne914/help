"use client";

import { useEffect, useRef } from "react";

let observer: IntersectionObserver | null = null;
function revealObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).dataset.reveal = "shown";
        observer?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  return observer;
}

const tracked = new Set<HTMLElement>();

function reduced() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Show a block that is on screen; keep observing one that is still below. Never leave it pending unobserved. */
function syncReveal(el: HTMLElement) {
  if (!el.isConnected) {
    tracked.delete(el);
    return;
  }
  if (reduced() || !("IntersectionObserver" in window)) {
    delete el.dataset.reveal;
    observer?.unobserve(el);
    return;
  }
  const r = el.getBoundingClientRect();
  const onScreen = r.top < window.innerHeight && r.bottom > 0;
  if (onScreen || r.top < window.innerHeight) {
    el.dataset.reveal = "shown";
    observer?.unobserve(el);
    return;
  }
  el.dataset.reveal = "pending";
  revealObserver().observe(el);
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  const rescan = () => tracked.forEach(syncReveal);
  window.addEventListener("resize", rescan);
  window.addEventListener("pageshow", rescan);
  window.addEventListener("popstate", () => requestAnimationFrame(rescan));
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", rescan);
}

/**
 * Secondary blocks fade in when scrolled to. Content is visible in the server HTML: only blocks
 * that are still below the viewport after hydration are hidden (data-reveal="pending"), so no-JS,
 * slow JS and reduced motion all show the page as is, and nothing on screen ever disappears.
 * Resize, back-navigation and a change of reduced motion re-check every tracked block, so a
 * pending block cannot sit on screen without an observer.
 */
export function Reveal({
  delay = 0,
  className,
  children,
  as = "div",
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    listen();
    tracked.add(el);
    syncReveal(el);
    return () => {
      tracked.delete(el);
      observer?.unobserve(el);
    };
  }, []);
  const Tag = as as "div";
  const style = delay ? ({ "--reveal-delay": `${Math.min(delay, 0.2)}s` } as React.CSSProperties) : undefined;
  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}

/** Thin accent line that draws in when the section enters the viewport. */
export function SectionRule({ index }: { index: string }) {
  return (
    <div aria-hidden="true">
      <Reveal className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <span className="font-mono text-xs text-accent">/{index}</span>
        <span className="rule-line h-px flex-1 origin-left bg-gradient-to-r from-accent via-accent/40 to-transparent" />
      </Reveal>
    </div>
  );
}
