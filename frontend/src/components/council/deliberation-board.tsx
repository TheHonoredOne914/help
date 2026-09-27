import React from "react";
import type { CouncilDispute, CouncilSeal } from "./council-types";
import { labelForCouncillor } from "./councillor-card";

export function DeliberationBoard({ seals, disputes, agreementScore }: { seals: CouncilSeal[]; disputes: CouncilDispute[]; agreementScore: number }) {
  if (!seals.length && !disputes.length) {
    return null;
  }

  const score = Math.max(0, Math.min(100, Math.round(agreementScore || 0)));

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-sm">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--navy)_50%,transparent)] to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--slate)]">Deliberation Layer</p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">Agreement vs Conflict</h3>
          <p className="mt-1 max-w-2xl text-sm text-[var(--slate)]">
            The chamber converts six advisory briefs into debate-safe claims, contested lines, and source-risk warnings.
          </p>
        </div>
        <div className="min-w-[170px] rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center justify-between text-xs text-[var(--slate)]">
            <span>Council agreement</span>
            <span className="font-semibold text-[var(--ink)]">{score}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div className="h-full rounded-full bg-[var(--navy)]" style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--status-success)_20%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_6%,transparent)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--status-success)]">Council Seals</h4>
            <span className="rounded-full border border-[color-mix(in_srgb,var(--status-success)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_10%,transparent)] px-2 py-0.5 text-2xs text-[var(--status-success)]">
              3+ council support
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {seals.length ? seals.map((seal) => (
              <div key={`${seal.seal_id}-${seal.level}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--ink)]">
                <p className="break-words leading-6">{seal.claim.text}</p>
                <p className="mt-2 text-xs text-[var(--status-success)]">
                  Endorsed by {seal.endorsing_councillors.map(labelForCouncillor).join(", ")}
                </p>
              </div>
            )) : <p className="text-sm text-[var(--slate)]">No Council Seal yet. Broad agreement has not formed.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--brass)_20%,transparent)] bg-[color-mix(in_srgb,var(--brass)_6%,transparent)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">Conflict Lines</h4>
            <span className="rounded-full border border-[color-mix(in_srgb,var(--brass)_25%,transparent)] bg-[color-mix(in_srgb,var(--brass)_10%,transparent)] px-2 py-0.5 text-2xs text-amber-700 dark:text-amber-400">
              contested
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {disputes.length ? disputes.map((dispute) => (
              <div key={dispute.dispute_id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--ink)]">
                <p className="break-words leading-6">{dispute.claim_a.text}</p>
                <p className="mt-2 break-words text-xs leading-5 text-amber-700 dark:text-amber-400">Pressure point: {dispute.claim_b.text}</p>
                <p className="mt-2 text-2xs uppercase tracking-[0.16em] text-[var(--slate)]">{dispute.conflict_type.replace(/_/g, " ")}</p>
              </div>
            )) : <p className="text-sm text-[var(--slate)]">No structured disputes yet. Opposition stress-testing is still forming.</p>}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-[var(--slate)] md:grid-cols-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <span className="text-[var(--navy)]">Strong claims</span> are safe to lead with when backed by citations.
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <span className="text-amber-700 dark:text-amber-400">Risky claims</span> need tighter wording or should be held for rebuttal.
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <span className="text-[var(--navy)]">Evidence gaps</span> remain visible instead of being promoted to success.
        </div>
      </div>
    </section>
  );
}
