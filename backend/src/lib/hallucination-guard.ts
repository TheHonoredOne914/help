import type { Division } from "./division-framework.js";
import type { EvidenceRegistry } from "./types.js";
import { telemetry } from "./telemetry.js";

export interface HallucinationCheckResult {
  passed: boolean;
  suspiciousArticles: string[];
  suspiciousCases: string[];
  fabricatedStats: string[];
  genericLanguageViolations: string[];
}

export function buildHallucinationGuard(division: Division, registry: EvidenceRegistry): string {
  const verifiedArticles = extractVerifiedArticleRefs(registry);
  const verifiedCases = extractVerifiedCaseNames(registry);
  const gaps = registry.evidenceGaps;

  const articleBlock = verifiedArticles.length > 0
    ? `VERIFIED CONSTITUTIONAL REFERENCES (cite only these; do not invent others):\n${verifiedArticles.map((a) => `- ${a}`).join("\n")}`
    : "WARNING: No Article references verified in retrieved sources. Do not cite any Article numbers in this division.";

  const caseBlock = verifiedCases.length > 0
    ? `VERIFIED CASE NAMES (cite only these; do not invent others):\n${verifiedCases.map((c) => `- ${c}`).join("\n")}`
    : "WARNING: No court judgements verified in retrieved sources. Do not cite any case names in this division.";

  const gapBlock = gaps.length > 0
    ? `EVIDENCE GAPS - DO NOT INVENT DATA FOR THESE. Write "SOURCE GAP: [topic] - not in retrieved evidence.":\n${gaps.map((g) => `- ${g}`).join("\n")}`
    : "";

  return `
## HALLUCINATION PREVENTION PROTOCOL (NON-NEGOTIABLE)
Division: ${division.id}
${articleBlock}

${caseBlock}

${gapBlock}

ABSOLUTE RULE: If a claim is analytically important but not present in the evidence block, write:
"SOURCE GAP: [claim] - not verified in retrieved sources."
Never estimate. Never interpolate. Never cite Article numbers, case names, or statistics not listed above.
`.trim();
}

export function validateDivisionOutput(output: string, registry: EvidenceRegistry): HallucinationCheckResult {
  const verifiedArticles = extractVerifiedArticleRefs(registry);
  const verifiedCases = extractVerifiedCaseNames(registry);
  const snippetOnlyUrls = new Set(registry.snippetOnlySources.map((s) => s.url));

  const citedArticles = output.match(/\bArticle\s+\d+[A-Za-z]?/g) ?? [];
  const suspiciousArticles = citedArticles.filter((article) =>
    !verifiedArticles.some((verified) => verified.toLowerCase().includes(article.toLowerCase()))
  );

  const citedCases = output.match(/\b[A-Z][a-z]+ (?:v\.|vs\.?) (?:Union of India|State of [A-Z]|[A-Z][a-z]+)/g) ?? [];
  const suspiciousCases = citedCases.filter((caseName) =>
    !verifiedCases.some((verified) => verified.toLowerCase().includes(caseName.toLowerCase().slice(0, 20)))
  );

  const fabricatedStats: string[] = [];
  const citationRe = /\[Source \d+\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = citationRe.exec(output)) !== null) {
    if (snippetOnlyUrls.has(match[1])) {
      const ctx = output.slice(Math.max(0, match.index - 120), match.index + 50);
      if (/\d[\d,]*(?:\.\d+)?\s*(?:crore|lakh|million|billion|percent|%)/i.test(ctx)) {
        fabricatedStats.push(`Stat near: "${ctx.trim().slice(0, 80)}" cited from snippet-only source`);
      }
    }
  }

  const genericPatterns = [
    /in the context of\b/gi,
    /many experts believe\b/gi,
    /it can be argued\b/gi,
    /this is a complex issue\b/gi,
    /there are various perspectives\b/gi,
    /multiple stakeholders\b/gi,
    /holistic framework\b/gi,
    /multifaceted approach\b/gi,
  ];
  const genericLanguageViolations = genericPatterns.flatMap((pattern) => output.match(pattern) ?? []);

  const passed = suspiciousArticles.length === 0
    && suspiciousCases.length < 2
    && fabricatedStats.length < 3
    && genericLanguageViolations.length === 0;

  if (!passed) telemetry.increment("hallucination.guard.blocked");

  return { passed, suspiciousArticles, suspiciousCases, fabricatedStats, genericLanguageViolations };
}

export function extractVerifiedArticleRefs(registry: EvidenceRegistry): string[] {
  const refs = new Set<string>();
  for (const source of registry.sources) {
    const text = `${source.content} ${source.snippet ?? ""}`;
    for (const match of text.matchAll(/\bArticle\s+\d+[A-Za-z]?(?:\s*\(\d+\))?/g)) {
      refs.add(match[0].replace(/\s+/g, " ").trim());
    }
  }
  return [...refs].slice(0, 20);
}

export function extractVerifiedCaseNames(registry: EvidenceRegistry): string[] {
  const cases = registry.courtJudgements.map(({ judgement }) =>
    `${judgement.caseName} (${judgement.year}, ${judgement.court})`
  );
  for (const source of registry.sources.slice(0, 10)) {
    const text = `${source.content} ${source.snippet ?? ""}`;
    for (const match of text.matchAll(/\b[A-Z][A-Za-z]+ (?:v\.|vs\.?) (?:Union of India|State of [A-Z][A-Za-z]+|[A-Z][A-Za-z]+)\s*\(\d{4}\)/g)) {
      cases.push(match[0]);
    }
  }
  return [...new Set(cases)].slice(0, 15);
}
