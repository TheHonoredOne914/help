import type { ClaimGraph } from "../../evidence/claim-graph.js";

export function buildClaimGraphRoleContext(
  claimGraph: ClaimGraph | undefined,
  options: { roleName: string; assignedSourceIds: Iterable<number>; limit?: number },
): string {
  if (!claimGraph) return "ClaimGraph Context: none";
  const assigned = new Set([...options.assignedSourceIds].map(Number));
  const limit = options.limit ?? 6;
  const claims = (claimGraph.claims ?? [])
    .filter((claim) => intersects(claim.supportingSourceIds, assigned))
    .slice(0, limit);
  const counterclaims = (claimGraph.counterclaims ?? [])
    .filter((claim) => intersects(claim.sourceIds, assigned) || claims.some((item) => item.id === claim.challengedClaimId))
    .slice(0, 4);
  const contradictions = (claimGraph.contradictions ?? [])
    .filter((item) => intersects(item.sourceIds, assigned) || item.claimIds.some((id) => claims.some((claim) => claim.id === id)))
    .slice(0, 4);
  const unsupported = (claimGraph.unsupportedClaims ?? []).slice(0, 4);
  return [
    "ClaimGraph Context:",
    claims.length
      ? claims.map((claim) => `Claim ${claim.id}; SourceIds: ${claim.supportingSourceIds.join(", ")}; Confidence: ${claim.confidence}; ForbiddenIfUnsupported: ${claim.forbiddenIfUnsupported}; Text: ${claim.text}`).join("\n")
      : "Relevant claims: none for this batch.",
    counterclaims.length
      ? `Counterclaims:\n${counterclaims.map((claim) => `Counterclaim ${claim.id}; SourceIds: ${claim.sourceIds.join(", ")}; Challenges: ${claim.challengedClaimId ?? "unspecified"}; Text: ${claim.text}`).join("\n")}`
      : "Counterclaims: none for this batch.",
    contradictions.length
      ? `Contradictions:\n${contradictions.map((item) => `Contradiction ${item.id}; Severity: ${item.severity}; SourceIds: ${item.sourceIds.join(", ")}; ${item.description}`).join("\n")}`
      : "Contradictions: none for this batch.",
    unsupported.length
      ? `Forbidden-if-unsupported / unsupported issues:\n${unsupported.map((item) => `${item.type}: ${item.claim}`).join("\n")}`
      : "Forbidden-if-unsupported / unsupported issues: none.",
    `Role instruction: ${options.roleName} must confirm, extend, challenge, or qualify these claims only using assigned source IDs.`,
  ].join("\n");
}

function intersects(ids: number[] | undefined, allowed: Set<number>): boolean {
  return (ids ?? []).some((id) => allowed.has(Number(id)));
}
