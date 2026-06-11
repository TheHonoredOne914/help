import type { ClaimGraph } from "./types.js";

export function buildClaimGraphSummary(graph: ClaimGraph): NonNullable<ClaimGraph["summary"]> {
  const strongClaimCount = graph.claims.filter((claim) => (claim.supportScore ?? 0) >= 70).length;
  const carefulLanguageClaimCount = graph.claims.filter((claim) => claim.mustUseCarefulLanguage).length;
  const approvedSourceCount = new Set(graph.claims.flatMap((claim) => claim.sourceTrace ?? []).filter((trace) => trace.validationStatus === "approved").map((trace) => trace.sourceId)).size;
  return {
    claimCount: graph.claims.length,
    counterclaimCount: graph.counterclaims?.length ?? 0,
    contradictionCount: graph.contradictions?.length ?? 0,
    strongClaimCount,
    carefulLanguageClaimCount,
    approvedSourceCount,
  };
}
