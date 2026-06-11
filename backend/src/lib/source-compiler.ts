import { canonicalizeUrl } from "./rag.js";
import type { EnrichedResult } from "./types.js";

export interface CompiledSourceBlock {
  index: number;
  url: string;
  title: string;
  sourceType: string;
  score: number;
  badge: string;
  fullContent: string;
  snippet: string;
  reportType?: string;
  judgement?: EnrichedResult["judgement"];
}

export interface FullSourceManifest {
  totalSources: number;
  compiledBlocks: CompiledSourceBlock[];
  numberedList: string;
  fullContextBlock: string;
  courtJudgements: CompiledSourceBlock[];
  govSources: CompiledSourceBlock[];
  intlSources: CompiledSourceBlock[];
  generalSources: CompiledSourceBlock[];
}

export function compileFullSourceManifest(
  allResults: EnrichedResult[],
  primaryQuery: string,
): FullSourceManifest {
  void primaryQuery;
  const seen = new Set<string>();
  const unique = allResults.filter((result) => {
    const key = canonicalizeUrl(result.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sorted = [...unique].sort((a, b) => {
    const tierA = getSourceTier(a);
    const tierB = getSourceTier(b);
    if (tierA !== tierB) return tierA - tierB;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  const compiled: CompiledSourceBlock[] = sorted.map((result, index) => ({
    index: index + 1,
    url: result.url,
    title: result.title || result.url,
    sourceType: result.sourceType ?? "general",
    score: result.score ?? 5,
    badge: buildSourceBadge(result),
    fullContent: (result.content || result.snippet || "").trim(),
    snippet: result.snippet || "",
    reportType: result.reportType,
    judgement: result.judgement,
  }));

  const numberedList = compiled
    .map((block) => `[${block.index}] ${block.badge} ${block.title} - ${block.url}`)
    .join("\n");

  const fullContextBlock = compiled.map((block) => {
    const header = `--- SOURCE [${block.index}] ${block.badge} ${block.title}\nURL: ${block.url}`;
    const reportLine = block.reportType ? `\nReport Type: ${block.reportType}` : "";
    const judgementBlock = block.judgement?.isJudgement
      ? `\nCase: ${block.judgement.caseName} (${block.judgement.year}, ${block.judgement.court})\nHeld: ${block.judgement.held}`
      : "";
    const content = block.fullContent
      ? `\nContent:\n${block.fullContent}`
      : block.snippet
        ? `\nSnippet: ${block.snippet}`
        : "\n[No content available]";
    return `${header}${reportLine}${judgementBlock}${content}\n---`;
  }).join("\n\n");

  return {
    totalSources: compiled.length,
    compiledBlocks: compiled,
    numberedList,
    fullContextBlock,
    courtJudgements: compiled.filter((block) => block.sourceType === "court_judgement" || Boolean(block.judgement?.isJudgement)),
    govSources: compiled.filter((block) => block.sourceType === "government_india" && block.score >= 9),
    intlSources: compiled.filter((block) =>
      block.sourceType === "government_international" || block.sourceType === "international_research"
    ),
    generalSources: compiled.filter((block) =>
      block.sourceType !== "court_judgement"
      && block.sourceType !== "government_india"
      && block.sourceType !== "government_international"
      && block.sourceType !== "international_research"
    ),
  };
}

function getSourceTier(result: EnrichedResult): number {
  if (result.sourceType === "government_india" && (result.score ?? 0) >= 10) return 1;
  if (result.sourceType === "court_judgement" || result.judgement?.isJudgement) return 2;
  if (result.sourceType === "government_international") return 3;
  if (result.sourceType === "academic_india" || result.sourceType === "international_research") return 4;
  if (result.sourceType === "media_india") return 5;
  return 6;
}

function buildSourceBadge(result: EnrichedResult): string {
  const url = result.url.toLowerCase();
  if (url.includes("cag.gov.in")) return "[CAG REPORT]";
  if (url.includes("ncrb.gov.in")) return "[NCRB DATA]";
  if (url.includes("pib.gov.in")) return "[PIB OFFICIAL]";
  if (result.sourceType === "court_judgement" || result.judgement?.isJudgement) return "[COURT]";
  if (result.sourceType === "government_india" && (result.score ?? 0) >= 10) return "[GOV.IN]";
  if (result.sourceType === "government_international") return "[INTL GOV]";
  if (result.sourceType === "academic_india") return "[ACADEMIC]";
  if (result.sourceType === "international_research") return "[INTL RESEARCH]";
  return "[WEB]";
}
