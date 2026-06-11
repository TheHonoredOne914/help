import type { ClaimGraph, EvidenceClaim } from "./types.js";

export function formatClaimGraphForPrompt(graph: ClaimGraph, limit = 24): string {
  const strong = graph.claims.filter((claim) => (claim.supportScore ?? 0) >= 60 && claim.validationStatus !== "rejected").sort((a, b) => (b.supportScore ?? 0) - (a.supportScore ?? 0)).slice(0, limit);
  const careful = graph.claims.filter((claim) => claim.mustUseCarefulLanguage).sort((a, b) => (b.supportScore ?? 0) - (a.supportScore ?? 0)).slice(0, Math.ceil(limit / 2));
  const forbidden = graph.claims.filter((claim) => claim.forbiddenIfUnsupported).sort((a, b) => (b.supportScore ?? 0) - (a.supportScore ?? 0)).slice(0, Math.ceil(limit / 2));
  return [
    `Summary: ${graph.summary?.claimCount ?? graph.claims.length} claims; ${graph.summary?.strongClaimCount ?? strong.length} strong; ${graph.counterclaims?.length ?? 0} counterclaims; ${graph.contradictions?.length ?? 0} contradictions.`,
    "Strongest supported claims:",
    renderClaims(strong),
    "Counterclaims:",
    (graph.counterclaims ?? []).slice(0, Math.ceil(limit / 2)).map((item) => `- ${item.id}: ${item.text} | challenges=${item.challengedClaimId ?? "unlinked"} | sources=${item.sourceIds.join(",")} | score=${item.supportScore}`).join("\n") || "- none",
    "Contradictions:",
    (graph.contradictions ?? []).slice(0, Math.ceil(limit / 2)).map((item) => `- ${item.id}: ${item.type}; ${item.description}; claims=${item.claimIds.join(",")}; sources=${item.sourceIds.join(",")}`).join("\n") || "- none",
    "Claims requiring careful language:",
    renderClaims(careful),
    "Forbidden if unsupported:",
    renderClaims(forbidden),
  ].join("\n");
}

function renderClaims(claims: EvidenceClaim[]): string {
  return claims.map((claim) => `- ${claim.id}: ${claim.text} | type=${claim.type} | score=${claim.supportScore ?? 0} | confidence=${claim.confidence} | sources=${claim.supportingSourceIds.join(",")} | classes=${(claim.sourceClasses ?? []).join(",")} | citation=${claim.citationStrength ?? "unknown"}${claim.requiresCarefulLanguageReason ? ` | careful=${claim.requiresCarefulLanguageReason}` : ""}`).join("\n") || "- none";
}
