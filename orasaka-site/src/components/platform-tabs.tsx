"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import type { Platform } from "@/config/platforms";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash.slice(1);

export function PlatformTabs({ platforms }: { platforms: Platform[] }) {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  // A hash change (e.g. a link from /devices) wins over an earlier tab click.
  const [chosen, setChosen] = useState<{ index: number; hash: string } | null>(null);
  const fromHash = platforms.findIndex((p) => p.id === hash);
  const active = chosen && chosen.hash === hash ? chosen.index : Math.max(fromHash, 0);
  const setActive = (index: number) => setChosen({ index, hash });
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();

  function onKeyDown(e: React.KeyboardEvent) {
    const last = platforms.length - 1;
    const next =
      e.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="min-w-0">
      <div role="tablist" aria-label="Платформа" onKeyDown={onKeyDown} className="flex gap-2 overflow-x-auto pb-2">
        {platforms.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${base}-tab-${p.id}`}
            aria-selected={i === active}
            aria-controls={`${base}-panel-${p.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className="min-h-11 shrink-0 rounded-md border border-line px-4 text-sm font-semibold text-muted transition-colors duration-150 hover:text-fg aria-selected:border-accent aria-selected:bg-accent/10 aria-selected:text-fg"
          >
            {p.name}
          </button>
        ))}
      </div>
      {platforms.map((p, i) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`${base}-panel-${p.id}`}
          aria-labelledby={`${base}-tab-${p.id}`}
          hidden={i !== active}
          tabIndex={0}
          className="mt-4 rounded-xl border border-line bg-surface p-6"
        >
          <h2 className="font-display text-xl font-semibold">{p.name}</h2>
          <ol className="mt-5 space-y-4">
            {p.steps.map((s, n) => (
              <li key={s} className="flex gap-4">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md border border-accent/50 font-mono text-sm text-accent">
                  {n + 1}
                </span>
                <span className="pt-1 leading-relaxed text-muted">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
