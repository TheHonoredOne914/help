import React from "react";
import type { CouncilDispute, CouncilSeal } from "./council-types";
import { labelForCouncillor } from "./councillor-card";

export function DeliberationBoard({ seals, disputes, agreementScore }: { seals: CouncilSeal[]; disputes: CouncilDispute[]; agreementScore: number }) {
  const score = Math.max(0, Math.min(100, Math.round(agreementScore || 0)));

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#27324a] bg-[linear-gradient(180deg,rgba(11,16,27,0.94),rgba(7,9,14,0.96))] p-5 text-slate-100 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.95)]">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#3b6fd4]/50 to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">Deliberation Layer</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-50">Agreement vs Conflict</h3>
          <p className="mt-1 max-w-2xl text-sm text-[#96a2b8]">
            The chamber converts six advisory briefs into debate-safe claims, contested lines, and source-risk warnings.
          </p>
        </div>
        <div className="min-w-[170px] rounded-2xl border border-white/[0.07] bg-black/25 p-3">
          <div className="flex items-center justify-between text-xs text-[#9ba8c2]">
            <span>Council agreement</span>
            <span className="font-semibold text-amber-100">{score}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#3b6fd4] to-amber-300" style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Council Seals</h4>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100">
              3+ council support
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {seals.length ? seals.map((seal) => (
              <div key={`${seal.seal_id}-${seal.level}`} className="rounded-xl border border-emerald-200/10 bg-black/20 p-3 text-sm text-emerald-50">
                <p className="break-words leading-6">{seal.claim.text}</p>
                <p className="mt-2 text-xs text-emerald-200">
                  Endorsed by {seal.endorsing_councillors.map(labelForCouncillor).join(", ")}
                </p>
              </div>
            )) : <p className="text-sm text-[#96a2b8]">No Council Seal yet. Broad agreement has not formed.</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">Conflict Lines</h4>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
              contested
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {disputes.length ? disputes.map((dispute) => (
              <div key={dispute.dispute_id} className="rounded-xl border border-amber-200/10 bg-black/20 p-3 text-sm text-amber-50">
                <p className="break-words leading-6">{dispute.claim_a.text}</p>
                <p className="mt-2 break-words text-xs leading-5 text-amber-200">Pressure point: {dispute.claim_b.text}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#a89977]">{dispute.conflict_type.replace(/_/g, " ")}</p>
              </div>
            )) : <p className="text-sm text-[#96a2b8]">No structured disputes yet. Opposition stress-testing is still forming.</p>}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-[#9ba8c2] md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
          <span className="text-[#c9d6f4]">Strong claims</span> are safe to lead with when backed by citations.
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
          <span className="text-amber-100">Risky claims</span> need tighter wording or should be held for rebuttal.
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
          <span className="text-[#c9d6f4]">Evidence gaps</span> remain visible instead of being promoted to success.
        </div>
      </div>
    </section>
  );
}
