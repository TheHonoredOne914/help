import React, { type ReactNode } from "react";
import type { CouncilVerdict } from "./council-types";

export function FloorStrategyPanel({ verdict }: { verdict: CouncilVerdict | null }) {
  if (!verdict) {
    return null;
  }

  const leadingArguments = verdict?.top_arguments ?? [];
  const vulnerabilities = verdict?.top_vulnerabilities ?? [];
  const poiBank = verdict?.poi_bank ?? [];
  const clashMatrix = verdict?.clash_matrix ?? { government_args: [], opposition_args: [], crossfire_points: [] };

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)]">
      <div className="pointer-events-none absolute -right-16 top-0 h-40 w-40 rounded-full bg-[color-mix(in_srgb,var(--brass)_12%,transparent)] blur-3xl" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--slate)]">Floor Strategy Layer</p>
        <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">From advisory briefs to committee action</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--slate)]">
          The chamber translates deliberation into opening lines, POIs, rebuttal timing, and a Treasury-Opposition clash map.
        </p>
      </div>

      <div className="relative mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <StrategyColumn title="Opening Arguments" eyebrow="lead with" empty="Opening arguments pending.">
          {leadingArguments.slice(0, 3).map((item, index) => (
            <StrategyItem key={`${item.argument}-${index}`} label={item.strength} text={item.argument} />
          ))}
        </StrategyColumn>

        <StrategyColumn title="Lines To Avoid" eyebrow="will get attacked" empty="No high-risk lines isolated yet.">
          {vulnerabilities.slice(0, 3).map((item, index) => (
            <StrategyItem key={`${item.vulnerability}-${index}`} label={item.severity} text={item.vulnerability} warning />
          ))}
        </StrategyColumn>

        <StrategyColumn title="POIs And Timing" eyebrow="deploy selectively" empty="POI bank pending.">
          {poiBank.slice(0, 3).map((item, index) => (
            <StrategyItem key={`${item.poi}-${index}`} label={item.timing_cue} text={item.poi} />
          ))}
        </StrategyColumn>
      </div>

      <div className="relative mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-[var(--ink)]">Treasury vs Opposition Clash Map</h4>
            <p className="mt-1 text-xs text-[var(--slate)]">Use this to decide where to defend, where to concede, and where to counterpunch.</p>
          </div>
          <span className="rounded-full border border-[color-mix(in_srgb,var(--navy)_30%,transparent)] bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] px-2.5 py-1 text-xs text-[var(--navy)]">
            rebuttal posture
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ClashList title="Treasury Bench" items={clashMatrix.government_args} empty="Government defence pending." />
          <ClashList title="Opposition Attack" items={clashMatrix.opposition_args} empty="Opposition attack lines pending." warning />
          <ClashList title="Crossfire Points" items={clashMatrix.crossfire_points} empty="No crossfire points mapped yet." />
        </div>
      </div>
    </section>
  );
}

function StrategyColumn({ title, eyebrow, empty, children }: { title: string; eyebrow: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-[var(--slate)]">{eyebrow}</p>
      <h4 className="mt-1 text-sm font-semibold text-[var(--ink)]">{title}</h4>
      <div className="mt-3 space-y-2">
        {hasChildren ? children : <p className="text-sm text-[var(--slate)]">{empty}</p>}
      </div>
    </div>
  );
}

function StrategyItem({ label, text, warning = false }: { label: string; text: string; warning?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <span className={warning ? "text-2xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400" : "text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--navy)]"}>
        {label}
      </span>
      <p className="mt-1 break-words text-sm leading-6 text-[var(--ink)]">{text}</p>
    </div>
  );
}

function ClashList({ title, items, empty, warning = false }: { title: string; items: string[]; empty: string; warning?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
      <h5 className={warning ? "text-xs font-semibold text-amber-700 dark:text-amber-400" : "text-xs font-semibold text-[var(--navy)]"}>{title}</h5>
      {items.length ? (
        <ul className="mt-2 space-y-2 text-sm text-[var(--ink)]">
          {items.slice(0, 4).map((item, index) => (
            <li key={`${item}-${index}`} className="break-words leading-5">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[var(--slate)]">{empty}</p>
      )}
    </div>
  );
}
