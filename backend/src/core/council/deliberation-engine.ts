import type { ClaimObject, CouncilDeliberationResult, CouncilDispute, CouncilSeal, CouncillorOutput, RetrievingCouncillorId } from "./council-types.js";

export function findCouncilSeals(outputs: CouncillorOutput[]): CouncilDeliberationResult {
  const claims = outputs.flatMap((output) => output.status === "complete" ? output.key_claims : []);
  const clusters = clusterClaims(claims);
  const seals: CouncilSeal[] = [];
  const disputes: CouncilDispute[] = [];

  clusters.forEach((cluster, index) => {
    const endorsers = uniqueCouncillors(cluster.filter((claim) => claim.stance !== "challenges"));
    if (endorsers.length >= 3) {
      const lead = strongestClaim(cluster);
      seals.push({
        seal_id: `seal_${index + 1}`,
        claim: lead,
        level: endorsers.length >= 4 ? "council_endorsed" : "probable",
        endorsing_councillors: endorsers,
        support_count: endorsers.length,
        supporting_claim_ids: cluster.map((claim) => claim.claim_id),
      });
    }
  });

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const conflict = conflictType(claims[i], claims[j]);
      if (!conflict) continue;
      disputes.push({
        dispute_id: `dispute_${disputes.length + 1}`,
        claim_a: claims[i],
        claim_b: claims[j],
        conflict_type: conflict,
        summary: `${claims[i].councillor_id} and ${claims[j].councillor_id} frame the same issue differently.`,
        councillors: uniqueCouncillors([claims[i], claims[j]]),
      });
    }
  }

  const agreementScore = claims.length === 0 ? 0 : Math.round((seals.reduce((sum, seal) => sum + seal.support_count, 0) / Math.max(1, claims.length)) * 100);
  return { seals, disputes: disputes.slice(0, 12), agreementScore };
}

function clusterClaims(claims: ClaimObject[]): ClaimObject[][] {
  const clusters: ClaimObject[][] = [];
  for (const claim of claims) {
    const target = clusters.find((cluster) => similarity(cluster[0].text, claim.text) >= 0.45 || sharedTags(cluster[0], claim) >= 2);
    if (target) target.push(claim);
    else clusters.push([claim]);
  }
  return clusters;
}

function strongestClaim(claims: ClaimObject[]): ClaimObject {
  return [...claims].sort((a, b) => confidenceScore(b.confidence) - confidenceScore(a.confidence) || b.source_ids.length - a.source_ids.length)[0];
}

function uniqueCouncillors(claims: ClaimObject[]): RetrievingCouncillorId[] {
  return [...new Set(claims.map((claim) => claim.councillor_id).filter((id): id is RetrievingCouncillorId => id !== "C7_CHIEF"))];
}

function conflictType(a: ClaimObject, b: ClaimObject): CouncilDispute["conflict_type"] | null {
  if (a.councillor_id === b.councillor_id) return null;
  const sim = similarity(a.text, b.text);
  if (sim < 0.28 && sharedTags(a, b) === 0) return null;
  if (a.stance === "supports" && b.stance === "challenges") return "direct_contradiction";
  if (a.stance === "challenges" && b.stance === "supports") return "direct_contradiction";
  if (a.source_ids.every((sourceId) => !b.source_ids.includes(sourceId)) && sim >= 0.45) return "evidence_conflict";
  if (sim >= 0.38) return "scope_disagreement";
  return null;
}

function sharedTags(a: ClaimObject, b: ClaimObject): number {
  const tags = new Set(a.tags.map((tag) => tag.toLowerCase()));
  return b.tags.filter((tag) => tags.has(tag.toLowerCase())).length;
}

function similarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length >= 5));
}

function confidenceScore(confidence: ClaimObject["confidence"]): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}
