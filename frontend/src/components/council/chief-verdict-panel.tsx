import React from "react";
import type { CouncilVerdict } from "./council-types";

export function ChiefVerdictPanel({ verdict, stream }: { verdict: CouncilVerdict | null; stream?: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-300/24 bg-[radial-gradient(circle_at_top_right,rgba(212,160,59,0.16),transparent_34%),linear-gradient(155deg,rgba(15,18,25,0.98),rgba(7,9,14,0.98))] p-5 text-slate-100 shadow-[0_24px_80px_-44px_rgba(212,160,59,0.5)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">Chief Councillor Verdict</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">Final strategy handoff</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#96a2b8]">
            The chamber has concluded. Use this as the pre-committee floor brief.
          </p>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
          chamber recommendation
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/25 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8190ad]">Final strategy verdict</h4>
        <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-[#eef3ff]">
          {verdict?.strategic_position || stream || "Chief Councillor verdict pending."}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Debate-safe lines</h4>
          <ul className="mt-3 space-y-2 text-sm text-[#d9e2f8]">
            {(verdict?.top_arguments ?? []).slice(0, 4).map((item, index) => (
              <li key={`${item.argument}-${index}`} className="break-words leading-6">
                {item.argument} <span className="text-emerald-200">({item.strength})</span>
              </li>
            ))}
            {!verdict?.top_arguments.length ? <li className="text-[#8d98ad]">Safe lines pending.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.05] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">High-risk lines</h4>
          <ul className="mt-3 space-y-2 text-sm text-[#d9e2f8]">
            {(verdict?.top_vulnerabilities ?? []).slice(0, 4).map((item, index) => (
              <li key={`${item.vulnerability}-${index}`} className="break-words leading-6">
                {item.vulnerability} <span className="text-amber-200">({item.severity})</span>
              </li>
            ))}
            {!verdict?.top_vulnerabilities.length ? <li className="text-[#8d98ad]">Risk lines pending.</li> : null}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-[#3b6fd4]/18 bg-[#3b6fd4]/[0.055] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a9c1ff]">Posture and tone</h4>
          <p className="mt-3 break-words text-sm leading-6 text-[#d9e2f8]">
            {verdict?.recommended_speech_strategy || "Speech posture pending."}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8190ad]">Opening strategy options</h4>
          <div className="mt-3 grid gap-2">
            {(verdict?.opening_speech_variants ?? []).slice(0, 3).map((item, index) => (
              <div key={`${item.style}-${index}`} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">{item.style}</span>
                <p className="mt-1 break-words text-sm leading-6 text-[#d9e2f8]">{item.text}</p>
              </div>
            ))}
            {!verdict?.opening_speech_variants.length ? <p className="text-sm text-[#8d98ad]">Opening options pending.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
