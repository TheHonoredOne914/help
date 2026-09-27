import React from "react";
import type { CouncilVerdict } from "./council-types";

export function ChiefVerdictPanel({ verdict, stream }: { verdict: CouncilVerdict | null; stream?: string }) {
  if (!verdict && !stream) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--brass)_50%,transparent)] to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--slate)]">Chief Councillor Verdict</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">Final strategy handoff</h3>
          <p className="mt-1 max-w-3xl text-sm text-[var(--slate)]">
            The chamber has concluded. Use this as the pre-committee floor brief.
          </p>
        </div>
        <span className="rounded-full border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] bg-[color-mix(in_srgb,var(--brass)_10%,transparent)] px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          chamber recommendation
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--slate)]">Final strategy verdict</h4>
        <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-[var(--ink)]">
          {verdict?.strategic_position || stream || "Chief Councillor verdict pending."}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--status-success)_20%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_6%,transparent)] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--status-success)]">Debate-safe lines</h4>
          <ul className="mt-3 space-y-2 text-sm text-[var(--ink)]">
            {(verdict?.top_arguments ?? []).slice(0, 4).map((item, index) => (
              <li key={`${item.argument}-${index}`} className="break-words leading-6">
                {item.argument} <span className="text-[var(--status-success)]">({item.strength})</span>
              </li>
            ))}
            {!verdict?.top_arguments.length ? <li className="text-[var(--slate)]">Safe lines pending.</li> : null}
          </ul>
        </div>
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--brass)_20%,transparent)] bg-[color-mix(in_srgb,var(--brass)_6%,transparent)] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">High-risk lines</h4>
          <ul className="mt-3 space-y-2 text-sm text-[var(--ink)]">
            {(verdict?.top_vulnerabilities ?? []).slice(0, 4).map((item, index) => (
              <li key={`${item.vulnerability}-${index}`} className="break-words leading-6">
                {item.vulnerability} <span className="text-amber-700 dark:text-amber-400">({item.severity})</span>
              </li>
            ))}
            {!verdict?.top_vulnerabilities.length ? <li className="text-[var(--slate)]">Risk lines pending.</li> : null}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--navy)_20%,transparent)] bg-[color-mix(in_srgb,var(--navy)_6%,transparent)] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--navy)]">Posture and tone</h4>
          <p className="mt-3 break-words text-sm leading-6 text-[var(--ink)]">
            {verdict?.recommended_speech_strategy || "Speech posture pending."}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--slate)]">Opening strategy options</h4>
          <div className="mt-3 grid gap-2">
            {(verdict?.opening_speech_variants ?? []).slice(0, 3).map((item, index) => (
              <div key={`${item.style}-${index}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">{item.style}</span>
                <p className="mt-1 break-words text-sm leading-6 text-[var(--ink)]">{item.text}</p>
              </div>
            ))}
            {!verdict?.opening_speech_variants.length ? <p className="text-sm text-[var(--slate)]">Opening options pending.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
