import { extractNumbers, importantClaimTokens, stableClaimId, trendDirection } from "./text.js";
import type { ClaimContradiction, EvidenceClaim } from "./types.js";

export function detectContradictions(claims: EvidenceClaim[]): ClaimContradiction[] {
  const contradictions: ClaimContradiction[] = [];
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
      const left = claims[leftIndex];
      const right = claims[rightIndex];
      if (sameSourceOnly(left, right)) continue;
      const numeric = numericConflict(left, right);
      if (numeric) contradictions.push(makeContradiction("numeric_conflict", left, right, numeric, "medium"));
      const legal = legalConflict(left, right);
      if (legal) contradictions.push(makeContradiction("legal_holding_conflict", left, right, legal, "high"));
      const official = officialWatchdogConflict(left, right);
      if (official) contradictions.push(makeContradiction("official_watchdog_conflict", left, right, official, "medium"));
      const trend = trendConflict(left, right);
      if (trend) contradictions.push(makeContradiction("trend_direction_conflict", left, right, trend, "medium"));
    }
  }
  return contradictions;
}

export function attachContradictions(claims: EvidenceClaim[], contradictions: ClaimContradiction[]): EvidenceClaim[] {
  return claims.map((claim) => ({
    ...claim,
    contradictionIds: contradictions.filter((contradiction) => contradiction.claimIds.includes(claim.id)).map((contradiction) => contradiction.id),
    mustUseCarefulLanguage: claim.mustUseCarefulLanguage || contradictions.some((contradiction) => contradiction.claimIds.includes(claim.id)),
  }));
}

function numericConflict(left: EvidenceClaim, right: EvidenceClaim): string | null {
  if (!["score", "rank", "trend"].includes(left.type) || !["score", "rank", "trend"].includes(right.type)) return null;
  if (!sharedNonNumericToken(left, right)) return null;
  const leftNumbers = extractNumbers(left.text);
  const rightNumbers = extractNumbers(right.text);
  if (leftNumbers.length === 0 || rightNumbers.length === 0) return null;
  if (leftNumbers.some((value) => rightNumbers.includes(value))) return null;
  return `Same metric/entity appears with different numeric values: ${leftNumbers[0]} vs ${rightNumbers[0]}.`;
}

function legalConflict(left: EvidenceClaim, right: EvidenceClaim): string | null {
  if (left.type !== "legal_holding" || right.type !== "legal_holding") return null;
  if (!sharedNonNumericToken(left, right)) return null;
  const opposing = /\bupheld|valid|permitted|constitutional\b/i.test(left.text) && /\bstruck|invalid|unconstitutional|violat/i.test(right.text)
    || /\bupheld|valid|permitted|constitutional\b/i.test(right.text) && /\bstruck|invalid|unconstitutional|violat/i.test(left.text);
  return opposing ? "Legal holdings appear to point in opposite directions." : null;
}

function officialWatchdogConflict(left: EvidenceClaim, right: EvidenceClaim): string | null {
  const leftClasses = left.sourceClasses ?? [];
  const rightClasses = right.sourceClasses ?? [];
  const officialLeft = leftClasses.some((sourceClass) => ["official_government", "electoral_body", "parliamentary_records"].includes(sourceClass));
  const officialRight = rightClasses.some((sourceClass) => ["official_government", "electoral_body", "parliamentary_records"].includes(sourceClass));
  const watchdogLeft = leftClasses.some((sourceClass) => /watchdog|rights|press|civic/.test(sourceClass));
  const watchdogRight = rightClasses.some((sourceClass) => /watchdog|rights|press|civic/.test(sourceClass));
  if (!((officialLeft && watchdogRight) || (officialRight && watchdogLeft))) return null;
  if (!sharedNonNumericToken(left, right)) return null;
  if (!/\bden(?:y|ies|ied)|safe|secure|complied|lawful|no evidence\b/i.test(`${left.text} ${right.text}`)) return null;
  if (!/\bconcern|violation|risk|alleg|critic|lack\b/i.test(`${left.text} ${right.text}`)) return null;
  return "Official position and watchdog/civil society claim conflict on the same issue.";
}

function trendConflict(left: EvidenceClaim, right: EvidenceClaim): string | null {
  const leftDirection = trendDirection(left.text);
  const rightDirection = trendDirection(right.text);
  if (!leftDirection || !rightDirection || leftDirection === rightDirection) return null;
  if (!sharedNonNumericToken(left, right)) return null;
  return `Trend direction conflict: ${leftDirection} vs ${rightDirection}.`;
}

function sharedNonNumericToken(left: EvidenceClaim, right: EvidenceClaim): boolean {
  const leftTokens = [...importantClaimTokens(left.text)].filter((token) => !/^\d/.test(token));
  const rightTokens = importantClaimTokens(right.text);
  return leftTokens.filter((token) => rightTokens.has(token)).length >= 2;
}

function sameSourceOnly(left: EvidenceClaim, right: EvidenceClaim): boolean {
  const leftIds = new Set(left.supportingSourceIds);
  const rightIds = new Set(right.supportingSourceIds);
  return leftIds.size === rightIds.size && [...leftIds].every((id) => rightIds.has(id));
}

function makeContradiction(type: ClaimContradiction["type"], left: EvidenceClaim, right: EvidenceClaim, description: string, severity: ClaimContradiction["severity"]): ClaimContradiction {
  return {
    id: stableClaimId("contradiction", `${left.id}:${right.id}:${type}`, [...left.supportingSourceIds, ...right.supportingSourceIds]),
    claimIds: [left.id, right.id],
    type,
    description,
    severity,
    sourceIds: [...new Set([...left.supportingSourceIds, ...right.supportingSourceIds])],
  };
}
