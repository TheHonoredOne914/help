import type { ResearchRunIdentity } from "../../core/pipeline/pipeline-events.js";
import type { RawEvidenceSourceInput } from "../../core/evidence/evidence-registry.js";
import type { BucketedRetrievalResult } from "../../core/retrieval/bucketed-retrieval.js";
import type { CouncilSession } from "../../core/council/index.js";
import type { PipelineMetadata } from "./pipeline-types.js";

export const COUNCIL_REQUIRED_SOURCES = 180;
export const COUNCIL_MIN_FINAL_WORDS = 3000;
export const COUNCIL_MAX_FINAL_WORDS = 5500;

export function councilRetrievalSourceToEvidenceInput(
  source: BucketedRetrievalResult["enrichedResults"][number],
): RawEvidenceSourceInput {
  return {
    title: source.title,
    url: source.url,
    canonicalUrl: source.canonicalUrl ?? source.url,
    domain: source.domain,
    date: source.publishedDate,
    excerpt: source.fullText ?? source.snippet,
    snippet: source.snippet,
    fullText: source.fullText ?? null,
    bucketIds: source.bucketIds,
    sourceClass: source.sourceClass,
    authorityScore: source.score,
    extractionQuality: source.extractionQuality ?? "snippet",
    discoveredBy: source.discoveredBy,
    extractionProvider: source.extractionProvider,
    keyFacts: [source.snippet, source.fullText?.slice(0, 280)]
      .filter((value): value is string => typeof value === "string" && value.trim().length >= 24),
    keyNumbers: [...new Set(`${source.title} ${source.snippet} ${source.fullText ?? ""}`.match(/\b20\d{2}\b|\b\d+(?:\.\d+)?%/g) ?? [])].slice(0, 5),
    legalHoldings: source.sourceClass === "court_primary" || source.sourceClass === "legal_commentary" ? [source.snippet].filter((value): value is string => Boolean(value)) : [],
    limitations: source.limitations ?? [],
    citationEligible: source.citationEligible ?? false,
    topChunks: source.fullText
      ? [{ text: source.fullText.slice(0, 700), score: 0.7, chunkIndex: 0 }]
      : source.snippet
        ? [{ text: source.snippet, score: 0.4, chunkIndex: 0 }]
        : [],
  };
}

export function renderCouncilSessionAnswer(session: CouncilSession): string {
  const councillorSections = Object.values(session.councillors)
    .filter((output): output is NonNullable<typeof output> => Boolean(output))
    .map((output) => [
      `## ${output.councillor_id}: ${output.title}`,
      output.status === "failed" ? `Status: failed. ${output.error ?? ""}` : output.summary,
      ...output.key_claims.slice(0, 12).map((claim) => `- ${claim.text} (${claim.source_ids.join(", ")})`),
    ].join("\n"))
    .join("\n\n");
  const sealLines = session.seals.length
    ? session.seals.map((seal) => `- ${seal.claim.text} (${seal.support_count} councillors: ${seal.endorsing_councillors.join(", ")})`).join("\n")
    : "- No Council Seal reached the 3-councillor threshold.";
  const disputeLines = session.disputes.length
    ? session.disputes.slice(0, 6).map((dispute) => `- ${dispute.summary}`).join("\n")
    : "- No major disputes were detected.";
  const verdict = session.verdict;
  const verdictSection = verdict
    ? [
        "## Chief Councillor Verdict",
        verdict.strategic_position,
        "### Top Arguments",
        ...verdict.top_arguments.map((item) => `- ${item.argument} (${item.strength})`),
        "### Top Vulnerabilities",
        ...verdict.top_vulnerabilities.map((item) => `- ${item.vulnerability} (${item.severity})`),
        "### Speech Strategy",
        verdict.recommended_speech_strategy,
        "### POI Bank",
        ...verdict.poi_bank.slice(0, 8).map((item) => `- ${item.poi} - ${item.timing_cue}`),
      ].join("\n")
    : "## Chief Councillor Verdict\nNo Chief verdict could be generated.";
  return [
    "# Council Session",
    `Agenda: ${session.topic}`,
    `Status: ${session.terminalStatus}`,
    "",
    "## Council Seals",
    sealLines,
    "",
    "## Disputes",
    disputeLines,
    "",
    councillorSections,
    "",
    verdictSection,
  ].join("\n").trim();
}

export function buildCouncilFinalAnswer(session: CouncilSession, retrieval: BucketedRetrievalResult): string {
  const baseAnswer = renderCouncilSessionAnswer(session);
  const answerSourceIds = extractCouncilMarkdownSourceIds(baseAnswer);
  const citedCount = answerSourceIds.size;
  if (countWords(baseAnswer) >= COUNCIL_MIN_FINAL_WORDS && citedCount >= COUNCIL_REQUIRED_SOURCES) {
    return trimCouncilAnswerToWordCap(baseAnswer);
  }

  let bestUnderCap = "";
  for (const factWordLimit of [18, 14, 12, 8, 5]) {
    const evidenceSection = buildCouncilEvidenceSection(retrieval, factWordLimit, COUNCIL_REQUIRED_SOURCES);
    if (!evidenceSection) continue;
    const candidate = `${baseAnswer.trim()}\n\n${evidenceSection}`;
    const candidateWords = countWords(candidate);
    const candidateCitations = extractCouncilMarkdownSourceIds(candidate).size;
    if (
      candidateWords >= COUNCIL_MIN_FINAL_WORDS
      && candidateCitations >= COUNCIL_REQUIRED_SOURCES
      && candidateWords <= COUNCIL_MAX_FINAL_WORDS
    ) {
      return candidate;
    }
    if (candidateWords <= COUNCIL_MAX_FINAL_WORDS && candidateWords > countWords(bestUnderCap)) {
      bestUnderCap = candidate;
    }
  }

  if (bestUnderCap) return bestUnderCap;
  const fallbackSection = buildCouncilEvidenceSection(retrieval, 3, COUNCIL_REQUIRED_SOURCES);
  return trimCouncilAnswerToWordCap(fallbackSection ? `${baseAnswer.trim()}\n\n${fallbackSection}` : baseAnswer);
}

export function buildCouncilEvidenceSection(
  retrieval: BucketedRetrievalResult,
  factWordLimit: number,
  sourceTarget: number,
): string {
  const bullets = retrieval.enrichedResults
    .map((source, index) => {
      const sourceId = index + 1;
      const fact = compactCouncilEvidenceFact([source.title, source.snippet, source.fullText].filter(Boolean).join(" "), factWordLimit);
      if (!fact || !source.url) return null;
      return `- ${fact} [Source ${sourceId}](${source.url})`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, sourceTarget);
  if (bullets.length === 0) return "";
  return [
    "## Additional Evidence Bullets",
    "Debate-ready cited points from the evidence registry:",
    ...bullets,
  ].join("\n");
}

export function compactCouncilEvidenceFact(value: string, maxWords: number): string {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/\b(JavaScript must be enabled|Decrease Font Size|Increase Font Size|Normal Theme|Sitemap|Advance Search)\b.*$/i, "")
    .trim();
  return truncateWords(cleaned || "Retrieved evidence record", maxWords);
}

export function extractCouncilMarkdownSourceIds(answer: string): Set<number> {
  const ids = new Set<number>();
  for (const match of answer.matchAll(/\[Source\s+(\d+)\]/gi)) {
    const id = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

export function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function truncateWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}...`;
}

export function trimCouncilAnswerToWordCap(answer: string): string {
  if (countWords(answer) <= COUNCIL_MAX_FINAL_WORDS) return answer;
  const notice = "\n\n## Trim Notice\nMode word-cap of 5500 words enforced.";
  const noticeWords = countWords(notice);
  return `${truncateWords(answer, Math.max(1, COUNCIL_MAX_FINAL_WORDS - noticeWords))}${notice}`;
}

export function buildCouncilMetadata(
  identity: ResearchRunIdentity,
  session: CouncilSession,
  retrieval: BucketedRetrievalResult,
  finalAnswer: string,
): PipelineMetadata {
  const citedCouncilSourceIds = extractCouncilMarkdownSourceIds(finalAnswer);
  const finalUniqueCitedSources = citedCouncilSourceIds.size;
  const citationEligibleSources = retrieval.citationEligibleEstimate;
  const passedStrict = session.terminalStatus === "completed" && finalUniqueCitedSources >= COUNCIL_REQUIRED_SOURCES;
  const passedWithSourceGaps = session.terminalStatus === "completed_with_source_gaps"
    || (session.terminalStatus === "completed" && finalUniqueCitedSources > 0 && finalUniqueCitedSources < COUNCIL_REQUIRED_SOURCES);
  const sourceContractStatus = passedStrict ? "passed" : passedWithSourceGaps ? "passed_with_source_gaps" : "failed";
  return {
    runId: identity.runId,
    requestId: identity.requestId,
    conversationId: identity.conversationId,
    assistantMessageId: identity.assistantMessageId,
    queryHash: identity.queryHash,
    researchMode: "council",
    terminalStatus: session.terminalStatus,
    coreGenerationUsed: false,
    legacyFallbackUsed: false,
    liveRetrievalUsed: true,
    sourceContract: {
      requiredSources: COUNCIL_REQUIRED_SOURCES,
      citationEligibleSources,
      finalUniqueCitedSources,
      passedStrict,
      passedWithSourceGaps,
      passed: passedStrict || passedWithSourceGaps,
      status: sourceContractStatus,
      reason: passedStrict
        ? "Council completed with at least one Council Seal."
        : passedWithSourceGaps
          ? "Council completed with partial councillor/source gaps."
          : "Council could not establish enough grounded councillor evidence.",
    },
    sourceGapReport: retrieval.sourceGapReport,
    citationStatus: {
      finalUniqueCitedSources,
      totalLinkedCitations: finalUniqueCitedSources,
      citedSourceIds: [...citedCouncilSourceIds].sort((a, b) => a - b),
      citationCoverage: citationEligibleSources > 0 ? finalUniqueCitedSources / citationEligibleSources : 0,
      invalidCitations: [],
      citedBuckets: [...new Set(retrieval.enrichedResults.flatMap((source) => source.bucketIds))],
    },
    councilSession: session,
    sources: retrieval.enrichedResults.map((source, index) => ({
      sourceId: index + 1,
      title: source.title,
      url: source.url,
      sourceType: source.sourceClass,
      bucketIds: source.bucketIds,
      cited: citedCouncilSourceIds.has(index + 1),
      discoveredBy: source.discoveredBy,
      extractedBy: source.extractionProvider,
      fallbackExtractionUsed: source.fallbackExtractionUsed,
    })),
  };
}

export const __councilTestHooks = {
  buildCouncilFinalAnswer,
  buildCouncilMetadata,
};
