import { extractCitationIds, getDivisionText, normalizeText } from "./quality-gate-input.js";
import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";

export function runCrossDivisionQualityGate(ctx: QualityGateRuntimeInput): GateResult {
  const issues: QualityIssue[] = [];
  const d7 = getDivisionText(ctx.input, "D7");
  const d11 = getDivisionText(ctx.input, "D11");
  const d1 = getDivisionText(ctx.input, "D1");
  const treasury = sliceBetween(d7, /Treasury Bench/i, /Opposition/i);
  const opposition = sliceBetween(d7, /Opposition/i, /POI|Rebuttal|Amendment/i);
  const treasurySources = new Set(extractCitationIds(treasury));
  const oppositionSources = new Set(extractCitationIds(opposition));
  const shared = [...treasurySources].filter((id) => oppositionSources.has(id));
  if (shared.length > 0 && Math.max(treasurySources.size, oppositionSources.size) > 0 && shared.length === Math.min(treasurySources.size, oppositionSources.size)) {
    issues.push({ code: "cross_division_recycling", message: "cross_division_recycling: D7 Treasury and Opposition use the same source set", severity: "fatal" });
  }
  if (similarity(d11, d7) > 0.72 || similarity(d11, d1) > 0.72) {
    issues.push({ code: "cross_division_recycling", message: "cross_division_recycling: D11 repeats D7/D1 instead of synthesizing", severity: "fatal" });
  }
  return { score: issues.length ? 0 : 10, maxScore: 10, issues, metrics: { d7SharedSourceCount: shared.length } };
}

function sliceBetween(text: string, start: RegExp, end: RegExp): string {
  const startMatch = text.match(start);
  if (!startMatch || startMatch.index == null) return "";
  const rest = text.slice(startMatch.index);
  const endMatch = rest.slice(startMatch[0].length).match(end);
  return endMatch?.index == null ? rest : rest.slice(0, startMatch[0].length + endMatch.index);
}

function similarity(a: string, b: string): number {
  const left = new Set(normalizeText(a).split(/\s+/).filter((token) => token.length > 4));
  const right = new Set(normalizeText(b).split(/\s+/).filter((token) => token.length > 4));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.min(left.size, right.size);
}
