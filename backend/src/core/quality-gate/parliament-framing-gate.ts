import { wordCount } from "./quality-gate-input.js";
import type { GateResult, QualityGateRuntimeInput, QualityIssue } from "./types.js";

const PARLIAMENT_TERMS = /\b(Treasury Bench|Opposition|Lok Sabha|Rajya Sabha|AIPPM|committee|Union ministry|Supreme Court|Election Commission|federalism|motion|amendment|POI|rebuttal|floor strategy|parliamentary question)\b/gi;
const UN_TERMS = /\b(member states|UN resolution|Security Council|General Assembly|ECOSOC|international community must|bloc politics)\b/gi;

export function runParliamentFramingGate(ctx: QualityGateRuntimeInput): GateResult {
  const issues: QualityIssue[] = [];
  const totalWords = Math.max(1, wordCount(ctx.finalText));
  const parliamentHits = (ctx.finalText.match(PARLIAMENT_TERMS) ?? []).length;
  const unHits = (ctx.finalText.match(UN_TERMS) ?? []).length;
  const densityPer500 = parliamentHits / (totalWords / 500);
  if (unHits > 0 || (ctx.contract.committeeSystem === "indian_mock_parliament" && unHits >= parliamentHits)) {
    issues.push({ code: "parliament_framing", message: "parliament_framing: UN framing takeover detected or dominates", severity: "fatal" });
  }
  if (ctx.contract.committeeSystem === "indian_mock_parliament" && densityPer500 < 3) {
    issues.push({ code: "parliament_framing", message: "parliament_framing: Indian parliamentary signal density is too weak", severity: "fatal" });
  }
  if (!/Treasury Bench/i.test(ctx.finalText) || !/Opposition/i.test(ctx.finalText)) {
    issues.push({ code: "parliament_framing", message: "parliament_framing: Treasury/Opposition framing missing", severity: "fatal" });
  }
  const score = issues.length ? Math.max(0, 10 - issues.length * 4) : 10;
  return { score, maxScore: 10, issues, metrics: { parliamentHits, unHits, densityPer500 }, categoryScores: { indianParliamentFraming: score } };
}
