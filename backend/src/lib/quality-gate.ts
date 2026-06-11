import { DIVISION_REGISTRY } from "./division-framework.js";
import { countCitations } from "./rag.js";
import { telemetry } from "./telemetry.js";
import type { DimensionEngineOutput, DivisionQualityReport, EvidenceRegistry, QualityReport } from "./types.js";

export function runQualityGate(
  fullOutput: string,
  engine: DimensionEngineOutput,
  registry: EvidenceRegistry,
): QualityReport {
  const divisionReports: DivisionQualityReport[] = [];
  const criticalFailures: string[] = [];
  const warnings: string[] = [];
  const sections = extractDivisionSections(fullOutput);

  for (const division of DIVISION_REGISTRY) {
    const content = sections.get(division.number) ?? "";
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const citationCount = countCitations(content);
    const namedEntities = (content.match(/\b(Article \d+|Section \d+|[A-Z][a-z]+ v\. [A-Z]|CAG|NCRB|PIB|MEA|Supreme Court|High Court|Lok Sabha|Rajya Sabha|AIPPM|NITI Aayog|RBI)\b/g) ?? []).length;
    const specificityScore = wordCount > 0 ? Math.min(100, (namedEntities / Math.max(wordCount / 100, 1)) * 10) : 0;
    const parliamentaryRegister = !/(in the context of|this is a complex|many experts believe|it can be argued)/i.test(content);
    const debateOperability = /(argument|position|rebuttal|POI|oppose|support|alliance|coalition)/i.test(content);

    const report: DivisionQualityReport = {
      divisionId: division.id,
      divisionName: division.name,
      wordCount,
      citationCount,
      specificityScore,
      parliamentaryRegister,
      debateOperability,
      issues: [],
    };

    if (wordCount < division.minWordsForPrimary * 0.5) {
      report.issues.push(`Critically short: ${wordCount} words (minimum ${division.minWordsForPrimary})`);
      if ([1, 2, 7, 11].includes(division.number)) {
        criticalFailures.push(`${division.name} is critically undersized (${wordCount} words)`);
      }
    }
    if (!parliamentaryRegister) {
      report.issues.push("Generic AI language detected - parliamentary register violation");
      warnings.push(`${division.name} contains generic language patterns`);
    }
    if (division.number === 7 && citationCount < 5) {
      report.issues.push("Debate Utility Arsenal lacks citations - evidence grounding weak");
      criticalFailures.push("Division 7 has fewer than 5 citations");
    }
    if (division.number === 7) {
      const poiPatterns = content.match(/\b(would the (?:honourable )?delegate|can the (?:honourable )?delegate|is the (?:honourable )?delegate (?:aware|prepared)|what does the delegate|does the delegate (?:acknowledge|accept|agree|concede|recognise|recognize)|point of information|would (?:the|their|this) delegation|can (?:the|their|this) delegation)\b/gi) ?? [];
      const poiCount = poiPatterns.length;
      if (poiCount < 15) {
        report.issues.push(`Insufficient POIs: ${poiCount} detected (minimum 15 required)`);
        criticalFailures.push(`Division 7 has only ${poiCount} POIs - Layer 7.4 requires 15-20`);
      }

      const rebuttalMatrix = content.match(/when\s+\[?[a-z\s]+\]?\s+argues/gi) ?? [];
      if (rebuttalMatrix.length < 5) {
        report.issues.push(`Rebuttal matrix too sparse: ${rebuttalMatrix.length} rebuttals (minimum 5)`);
      }

      const redLinesPresent = /red lines?|non-negotiable|cannot concede|will not accept/i.test(content);
      if (!redLinesPresent) {
        report.issues.push("Layer 7.8 (Red Lines Register) absent or too weak");
        warnings.push(`${division.name} missing Layer 7.8 Red Lines Register`);
      }

      const coalitionMap = /natural allies|coalition|alliance|bloc|swing delegate|unreachable/i.test(content);
      if (!coalitionMap) {
        report.issues.push("Layer 7.6 (Alliance & Coalition Map) absent");
        warnings.push(`${division.name} missing coalition intelligence`);
      }
    }
    if (division.number === 11) {
      const mirroredHeaders = ["Core Brief", "Stakeholder Mapping", "Conflict Mapping", "Narrative Analysis", "Policy Pathways", "Predictive Analysis", "Resolution Support"];
      const mirrored = mirroredHeaders.filter((header) => new RegExp(`##\\s*${header}`, "i").test(content));
      if (mirrored.length > 2) {
        report.issues.push(`Division 11 mirrors prior division structure: ${mirrored.join(", ")} - synthesis has become summarization`);
        criticalFailures.push("Division 11 strategic synthesis is summarizing, not synthesizing");
      }
      const synthesisSignals = /(leverage|asymmetry|structural contradiction|paradox|trap|underestimated|overlooked|hidden assumption|irony)/i;
      if (!synthesisSignals.test(content)) {
        warnings.push("Division 11 lacks genuine synthesis signal words - may be restating prior divisions");
      }
    }

    const boilerplatePatterns = [
      /stakeholders must come together\b/gi,
      /this complex issue requires\b/gi,
      /delicate balance between\b/gi,
      /a multifaceted approach\b/gi,
      /holistic framework\b/gi,
      /all parties should\b/gi,
      /comprehensive solution\b/gi,
      /there are no easy answers\b/gi,
    ];
    const boilerplateHits = boilerplatePatterns.flatMap((pattern) => content.match(pattern) ?? []);
    if (boilerplateHits.length > 3) {
      report.issues.push(`Generic MUN boilerplate: ${boilerplateHits.length} instances - analytical density insufficient`);
      warnings.push(`${division.name}: ${boilerplateHits.slice(0, 3).join("; ")}`);
    }

    const indiaSignals = [
      /\bArticle \d+\b/,
      /\bSection \d+\b/,
      /\b(CAG|NCRB|PIB|MEA|RBI|NITI|NHRC|ECI|NIA|CBI|ED)\b/,
      /\b(Supreme Court|High Court|Lok Sabha|Rajya Sabha|AIPPM)\b/,
      /\b(crore|lakh)\b/,
      /\b(BJP|Congress|INC|AAP|TMC)\b/,
    ];
    const indiaHits = indiaSignals.filter((pattern) => pattern.test(content)).length;
    if (indiaHits < 2 && content.length > 500) {
      warnings.push(`${division.name}: fewer than 2 India-specific signals detected - generic international MUN content risk`);
    }

    if (division.number === 2) {
      const expectedDimensions = [...engine.primaryDimensions, ...engine.secondaryDimensions].map((dimension) => dimension.name);
      const missingDimensions = expectedDimensions.filter((dimension) => !new RegExp(dimension.replace(/_/g, "[ _-]"), "i").test(content));
      if (missingDimensions.length > Math.max(1, expectedDimensions.length / 2)) {
        report.issues.push(`Division 2 misses active dimension coverage: ${missingDimensions.join(", ")}`);
      }
    }

    divisionReports.push(report);
  }

  const snippetOnlyUrls = registry.snippetOnlySources.map(s => s.url);
  const suspiciousCitations = fullOutput.match(/\[Source \d+\]\(https?:\/\/[^)]+\)/g)?.filter(
    cite => snippetOnlyUrls.some(url => cite.includes(url))
  ) ?? [];
  if (suspiciousCitations.length > 3) {
    warnings.push(`${suspiciousCitations.length} citations reference snippet-only sources - data accuracy unverified`);
  }
  if (suspiciousCitations.length > 5) {
    criticalFailures.push(`${suspiciousCitations.length} statistics cited from snippet-only sources - high hallucination risk`);
  }

  if (registry.courtJudgements.length > 0) {
    const citedCases = fullOutput.match(/\*\*[^*]+\(\d{4}[^)]*\)\*\*/g) ?? [];
    if (citedCases.length < registry.courtJudgements.length) {
      warnings.push(`${registry.courtJudgements.length - citedCases.length} court judgements from registry not cited in output`);
    }
  }

  const avgSpecificity = divisionReports.reduce((sum, report) => sum + report.specificityScore, 0) / Math.max(divisionReports.length, 1);
  const overallScore = Math.round(
    (divisionReports.filter((report) => report.issues.length === 0).length / Math.max(divisionReports.length, 1)) * 60
    + Math.min(40, avgSpecificity * 0.4),
  );
  telemetry.gauge("quality.overall_score", overallScore);

  return {
    passed: criticalFailures.length === 0,
    divisionReports,
    overallScore,
    criticalFailures,
    warnings,
  };
}

export function extractDivisionSections(fullOutput: string): Map<number, string> {
  const sections = new Map<number, string>();
  const headerPattern = /(?:^|\n)(?:(?:#{1,3}\s*)(?:DIVISION|Division)|\*{1,2}DIVISION|DIVISION)\s+(\d+)\b[^\n]*\n/g;
  const headers: Array<{ num: number; matchStart: number; contentStart: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headerPattern.exec(fullOutput)) !== null) {
    headers.push({
      num: Number.parseInt(match[1], 10),
      matchStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const current = headers[i];
    const next = headers[i + 1];
    sections.set(current.num, fullOutput.slice(current.contentStart, next?.matchStart ?? fullOutput.length).trim());
  }
  return sections;
}
