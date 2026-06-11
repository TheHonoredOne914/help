import React from "react";
import type { ClaimObject, CouncillorOutput, RetrievingCouncillorId } from "./council-types";

const STATUS_LABEL: Record<CouncillorOutput["status"], string> = {
  pending: "Awaiting brief",
  running: "Briefing live",
  complete: "Brief sealed",
  failed: "Failed",
};

const COUNCILLOR_META: Record<RetrievingCouncillorId, { title: string; specialization: string; mandate: string }> = {
  C1_LEGAL: {
    title: "Legal Councillor",
    specialization: "Constitutional and statutory risk",
    mandate: "Tests doctrine, rights challenges, Supreme Court exposure, and defensible legal framing.",
  },
  C2_ECONOMIC: {
    title: "Economic Councillor",
    specialization: "Fiscal and implementation pressure",
    mandate: "Interrogates budget logic, state capacity, data claims, and welfare tradeoffs.",
  },
  C3_STRATEGIC: {
    title: "Strategic Councillor",
    specialization: "Floor control and coalition math",
    mandate: "Shapes sequencing, party line discipline, POIs, and attack-response timing.",
  },
  C4_SOCIAL: {
    title: "Social Councillor",
    specialization: "Public impact and rights narrative",
    mandate: "Surfaces affected groups, civic risk, public order claims, and social legitimacy gaps.",
  },
  C5_HISTORICAL: {
    title: "Historical Councillor",
    specialization: "Precedent and institutional memory",
    mandate: "Anchors the case in legislative history, past disputes, committee practice, and reforms.",
  },
  C6_OPPOSITION: {
    title: "Opposition Councillor",
    specialization: "Adversarial stress test",
    mandate: "Attacks weak claims before committee opponents can exploit them.",
  },
};

export function CouncillorCard({ councillorId, output }: { councillorId: RetrievingCouncillorId; output: CouncillorOutput | null }) {
  const meta = COUNCILLOR_META[councillorId];
  const title = output?.title ?? meta.title;
  const status = output?.status ?? "pending";
  const strongestClaim = output?.key_claims.find((claim) => claim.stance === "supports") ?? output?.key_claims[0] ?? null;
  const warningClaim = output?.key_claims.find((claim) => claim.stance === "challenges") ?? null;
  const confidence = strongestClaim?.confidence ?? "medium";

  return (
    <article
      data-councillor-card={councillorId}
      className="group relative overflow-hidden rounded-2xl border border-[#27324a] bg-[linear-gradient(145deg,rgba(13,18,30,0.94),rgba(7,9,14,0.96))] p-4 text-slate-100 shadow-[0_18px_46px_-28px_rgba(0,0,0,0.95)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/35 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.55)]" />
            <h3 className="truncate text-sm font-semibold text-slate-50">{title}</h3>
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#7f8aa3]">{meta.specialization}</p>
        </div>
        <span className={statusClass(status)}>{STATUS_LABEL[status]}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#9ba8c2]">{meta.mandate}</p>
      <p className="mt-4 line-clamp-4 whitespace-pre-wrap break-words border-l border-[#3b6fd4]/45 pl-3 text-sm leading-6 text-[#d9e2f8]">
        {output?.summary || output?.raw_brief || "Waiting for this councillor to enter the chamber."}
      </p>
      <div className="mt-4 grid gap-2 text-xs">
        <BriefLine label="Strongest line" claim={strongestClaim} fallback="No floor-safe line delivered yet." />
        <BriefLine label="Warning" claim={warningClaim} fallback={output?.error ?? "No major vulnerability isolated yet."} warning />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[#3b6fd4]/30 bg-[#3b6fd4]/10 px-2.5 py-1 text-[11px] text-[#a9c1ff]">
          Evidence: {confidence}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#8f9ab3]">
          Sources {output?.sources_used.length ?? 0}
        </span>
        {output?.key_claims.slice(0, 2).map((claim) => (
          <span key={claim.claim_id} className={claimClass(claim)}>
            {claim.stance}
          </span>
        ))}
      </div>
    </article>
  );
}

function BriefLine({ label, claim, fallback, warning = false }: { label: string; claim: ClaimObject | null; fallback: string; warning?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5">
      <p className={warning ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200" : "text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9fb8ff]"}>
        {label}
      </p>
      <p className="mt-1 break-words text-[#d7dded]">{claim?.text ?? fallback}</p>
    </div>
  );
}

function claimClass(claim: ClaimObject): string {
  if (claim.stance === "challenges") {
    return "rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] text-amber-100";
  }
  if (claim.stance === "supports") {
    return "rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] text-emerald-100";
  }
  return "rounded-full border border-slate-300/15 bg-slate-300/10 px-2.5 py-1 text-[11px] text-slate-200";
}

function statusClass(status: CouncillorOutput["status"]): string {
  if (status === "failed") return "rounded-full border border-red-300/30 bg-red-500/12 px-2.5 py-1 text-[11px] font-medium text-red-200";
  if (status === "complete") return "rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium text-amber-100";
  if (status === "running") {
    return "rounded-full border border-[#3b6fd4]/45 bg-[#3b6fd4]/15 px-2.5 py-1 text-[11px] font-medium text-[#b8caff]";
  }
  return "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300";
}

export function labelForCouncillor(councillorId: RetrievingCouncillorId): string {
  return COUNCILLOR_META[councillorId].title;
}
