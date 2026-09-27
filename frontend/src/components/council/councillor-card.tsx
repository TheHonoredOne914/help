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
      className="group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--ink)] shadow-sm"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--brass)_35%,transparent)] to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--brass)]" />
            <h3 className="truncate text-sm font-semibold text-[var(--ink)]">{title}</h3>
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--slate)]">{meta.specialization}</p>
        </div>
        <span className={statusClass(status)}>{STATUS_LABEL[status]}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--slate)]">{meta.mandate}</p>
      <p className="mt-4 line-clamp-4 whitespace-pre-wrap break-words border-l border-[color-mix(in_srgb,var(--navy)_45%,transparent)] pl-3 text-sm leading-6 text-[var(--ink)]">
        {output?.summary || output?.raw_brief || "Waiting for this councillor to enter the chamber."}
      </p>
      <div className="mt-4 grid gap-2 text-xs">
        <BriefLine label="Strongest line" claim={strongestClaim} fallback="No floor-safe line delivered yet." />
        <BriefLine label="Warning" claim={warningClaim} fallback={output?.error ?? "No major vulnerability isolated yet."} warning />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[color-mix(in_srgb,var(--navy)_30%,transparent)] bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] px-2.5 py-1 text-xs text-[var(--navy)]">
          Evidence: {confidence}
        </span>
        <span className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs text-[var(--slate)]">
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
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-2.5">
      <p className={warning ? "text-2xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400" : "text-2xs font-semibold uppercase tracking-[0.16em] text-[var(--navy)]"}>
        {label}
      </p>
      <p className="mt-1 break-words text-[var(--ink)]">{claim?.text ?? fallback}</p>
    </div>
  );
}

function claimClass(claim: ClaimObject): string {
  if (claim.stance === "challenges") {
    return "rounded-full border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] bg-[color-mix(in_srgb,var(--brass)_10%,transparent)] px-2.5 py-1 text-xs text-amber-700 dark:text-amber-400";
  }
  if (claim.stance === "supports") {
    return "rounded-full border border-[color-mix(in_srgb,var(--status-success)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_10%,transparent)] px-2.5 py-1 text-xs text-[var(--status-success)]";
  }
  return "rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs text-[var(--slate)]";
}

function statusClass(status: CouncillorOutput["status"]): string {
  if (status === "failed") return "rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400";
  if (status === "complete") return "rounded-full border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] bg-[color-mix(in_srgb,var(--brass)_10%,transparent)] px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400";
  if (status === "running") {
    return "rounded-full border border-[color-mix(in_srgb,var(--navy)_45%,transparent)] bg-[color-mix(in_srgb,var(--navy)_15%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--navy)]";
  }
  return "rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--slate)]";
}

export function labelForCouncillor(councillorId: RetrievingCouncillorId): string {
  return COUNCILLOR_META[councillorId].title;
}
