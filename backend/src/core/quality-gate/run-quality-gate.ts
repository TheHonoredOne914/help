import { assertAgendaLock } from "../agenda/agenda-contract.js";
import { runCitationQualityGate } from "./citation-quality-gate.js";
import { runClaimGroundingGate } from "./claim-grounding-gate.js";
import { runCrossDivisionQualityGate } from "./cross-division-quality-gate.js";
import { runDivisionQualityGate } from "./division-quality-gate.js";
import { runElectoralSafetyGate } from "./electoral-safety-gate.js";
import { runFallbackQualityGate } from "./fallback-quality-gate.js";
import { runFinalAnswerLengthGate } from "./final-answer-length-gate.js";
import { runLegalSafetyGate } from "./legal-safety-gate.js";
import { resolveQualityMode, thresholdsFor } from "./mode-thresholds.js";
import { runParliamentFramingGate } from "./parliament-framing-gate.js";
import { runSourceDiversityGate } from "./source-diversity-gate.js";
import { buildQualityTelemetry } from "./quality-telemetry.js";
import type { GateResult, QualityGateReport, QualityGateRuntimeInput, QualityIssue } from "./types.js";

export function runQualityGate(ctx: QualityGateRuntimeInput): QualityGateReport {
  const mode = resolveQualityMode(ctx.input.mode, ctx.contract.outputDepth);
  const thresholds = thresholdsFor(mode);
  const agenda = runAgendaGate(ctx);
  const gateResults: GateResult[] = [
    agenda,
    runCitationQualityGate(ctx),
    runSourceDiversityGate(ctx, thresholds),
    runClaimGroundingGate(ctx, thresholds),
    runDivisionQualityGate(ctx, thresholds),
    runCrossDivisionQualityGate(ctx),
    runLegalSafetyGate(ctx),
    runElectoralSafetyGate(ctx),
    runParliamentFramingGate(ctx),
    runFallbackQualityGate(ctx),
    runFinalAnswerLengthGate(ctx, thresholds),
    runSourceGapBridgeGate(ctx),
  ];
  const issues = gateResults.flatMap((result) => result.issues);
  const fatalIssues = issues.filter((issue) => issue.severity === "fatal").map(formatIssue);
  const repairRequiredIssues = issues.filter((issue) => issue.severity === "repair").map(formatIssue);
  const warnings = issues.filter((issue) => issue.severity === "warning").map(formatIssue)
    .concat(gateResults.flatMap((result) => result.warnings ?? []));
  const categoryScores = Object.assign({}, ...gateResults.map((result) => result.categoryScores ?? {}));
  const rawScore = Math.round(gateResults.reduce((sum, result) => sum + result.score, 0) / gateResults.reduce((sum, result) => sum + result.maxScore, 0) * 100);
  const score = Math.max(0, Math.min(100, rawScore));
  const passed = fatalIssues.length === 0
    && repairRequiredIssues.length === 0
    && score >= thresholds.minScore;
  const automaticFailures = [
    ...fatalIssues,
    ...repairRequiredIssues,
    ...(score < thresholds.minScore ? [`quality_score_below_threshold: ${score} < ${thresholds.minScore}`] : []),
  ];
  return {
    passed,
    score,
    categoryScores,
    automaticFailures,
    warnings,
    fatalIssues,
    repairRequiredIssues,
    warningIssues: warnings,
    repairRequired: !passed,
    issues,
    telemetry: buildQualityTelemetry({
      score,
      categoryScores,
      mode,
      passed,
      fatalIssues,
      warnings,
      repairRequiredIssues,
      gateResults,
    }),
  };
}

const FRAUD_AND_HALLUCINATION_PATTERNS = [
  /\b(?:generative|constitutional)\s+(?:ai|algorithm|intelligence|writ)\b/i,
  /\b(?:ai|algorithm)(?:\s+governance|\s+bias|\s+ethics|\s+regulation|\s+accountability)\b/i,
  /\bdeepfakes?\b/i,
  /\b(?:election|vot)(?:\s+(?:was|were)\s+(?:rigged|stolen|fixed|compromised|hacked|manipulated))\b/i,
  /(?<!allegations of )\bEVMs?\s+(?:were|was|are)\s+(?:rigged|compromised|hacked|manipulated|tampered)\b/i,
  /\b(?:article|section|clause)\s+99[0-9]\b/i,
  /\bmember\s+states?\b(?:\s+of\s+the\s+UN)?/i,
  /\b(?:UN|United\s+Nations)\s+(?:Security\s+Council|resolution|General\s+Assembly)\b(?!\s+(?:reform|composition|veto|permanent\s+members))/i,
  /\b(?:as\s+an\s+AI|I\s+cannot\s+browse|I\s+don't\s+have\s+access\s+to\s+the\s+internet)\b/i,
  /\b(?:according\s+to\s+(?:anonymous|unnamed|undisclosed))\b/i,
  /\b(?:widely\s+(?:criticized|condemned|praised))\s+(?:as\s+|for\s+)(?:being\s+)?(?:a\s+|an\s+)?(?:landmark|unprecedented|historic)/i,
];

function detectFraudOrHallucination(text: string, contract?: QualityGateRuntimeInput["contract"]): string[] {
  const matches: string[] = [];
  const allowsAiElectionContent = contract
    ? /\b(deepfakes?|deep-fakes?|synthetic\s+political\s+content|ai-generated|online\s+political\s+advertising|platform\s+transparency)\b/i.test(contract.normalizedAgenda)
    : false;
  for (const pattern of FRAUD_AND_HALLUCINATION_PATTERNS) {
    const match = text.match(pattern);
    if (match && allowsAiElectionContent && /\bdeepfakes?|generative\s+ai\b/i.test(match[0])) continue;
    if (match) matches.push(match[0]);
  }
  return matches;
}

function runAgendaGate(ctx: QualityGateRuntimeInput): GateResult {
  const issues: QualityIssue[] = [];
  const report = assertAgendaLock(ctx.finalText, ctx.contract);
  // Comprehensive fraud/hallucination detection for all topics, not just democratic_space
  const fraudMatches = detectFraudOrHallucination(ctx.finalText, ctx.contract);
  for (const fraud of fraudMatches) {
    issues.push({ code: "agenda_drift", message: `potential fraud/hallucination: "${fraud}"`, severity: "fatal" });
  }
  if (ctx.contract.countryFocus === "India" && !/\bindia|indian\b/i.test(ctx.finalText)) {
    issues.push({ code: "agenda_drift", message: "India not central", severity: "fatal" });
  }
  for (const term of report.detectedDriftTerms) {
    if (/UN|member states|Security Council|resolution|international community/i.test(term)) continue;
    issues.push({ code: "agenda_drift", message: `agenda drift: ${term}`, severity: "fatal" });
  }
  return {
    score: Math.max(0, 10 - issues.length * 5),
    maxScore: 10,
    issues,
    categoryScores: { agendaLock: issues.length ? 0 : 10 },
  };
}

function runSourceGapBridgeGate(ctx: QualityGateRuntimeInput): GateResult {
  if (!ctx.input.sourceGapReport) return { score: 0, maxScore: 0, issues: [] };
  const issues: QualityIssue[] = [];
  const severeCodes = ["electoral_integrity", "legal_accuracy", "parliament_framing", "claim_grounding_traceability"];
  const text = ctx.finalText;
  const bypassMatches = detectFraudOrHallucination(text, ctx.contract);
  if (bypassMatches.length > 0) {
    issues.push({ code: "source_gap_bypass", message: `source_gap_bypass: SourceGapReport cannot bypass ${severeCodes.join(", ")} (detected: ${bypassMatches.join(", ")})`, severity: "fatal" });
  }
  return { score: issues.length ? 0 : 5, maxScore: 5, issues, warnings: ["source gap honestly disclosed"] };
}

function formatIssue(issue: QualityIssue): string {
  return issue.message.includes(issue.code) ? issue.message : `${issue.code}: ${issue.message}`;
}
