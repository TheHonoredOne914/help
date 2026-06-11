import { canMergeResearchAnswerIntoArchive } from "../src/core/archive/archive-merge-safety.js";
import { evaluateSourceContract } from "../src/core/evidence/source-contract.js";
import { decideFinalResearchStatus } from "../src/core/pipeline/final-status.js";
import { embedPipelineMetadata, extractPipelineMetadata, stripPipelineMetadata } from "../src/core/pipeline/pipeline-metadata.js";

const sourceGapReport = {
  explanation: "Fewer than 20 citation-eligible sources were available.",
  availableCitationEligibleSources: 15,
  requiredUniqueSources: 20,
  failedBuckets: ["court_legal"],
  weakBuckets: ["parliamentary_records"],
};

const sourceContract = evaluateSourceContract({
  mode: "deep_research",
  requiredSources: 20,
  citationEligibleSources: 15,
  finalUniqueCitedSources: 15,
  sourceGapReport,
  categoryScores: { sourceContract: 0 },
});

const qualityGate = {
  passed: true,
  score: 88,
  repairRequired: false,
  categoryScores: { sourceContract: 0 },
  automaticFailures: [],
  warnings: ["Source gap report attached."],
};

const citationStatus = {
  finalUniqueCitedSources: 15,
  totalLinkedCitations: 22,
  citedSourceIds: Array.from({ length: 15 }, (_, index) => index + 1),
  citationCoverage: 1,
};

const terminalStatus = decideFinalResearchStatus({
  mode: "deep_research",
  coreGenerationUsed: true,
  legacyFallbackUsed: false,
  sourceContract,
  sourceGapReport,
  qualityGate,
  citationStatus,
  visibleAnswer: "Validated answer [Source 1](https://pib.gov.in/example)",
});

const content = embedPipelineMetadata("Validated answer [Source 1](https://pib.gov.in/example)", {
  runId: "smoke_run",
  requestId: "smoke_request",
  conversationId: "smoke_conversation",
  assistantMessageId: "smoke_message",
  queryHash: "smoke_hash",
  researchMode: "deep_research",
  terminalStatus,
  coreGenerationUsed: true,
  legacyFallbackUsed: false,
  liveRetrievalUsed: true,
  sourceContract,
  sourceGapReport,
  qualityGate,
  citationStatus,
  bucketCoverage: { government_official: 5, indian_major_media: 4 },
  sources: [{ sourceId: 1, title: "PIB example", url: "https://pib.gov.in/example", sourceType: "official_government", cited: true }],
});

const parsed = extractPipelineMetadata(content);
const finalVisibleAnswerPreview = stripPipelineMetadata(content).slice(0, 160);
const canMergeIntoArchive = canMergeResearchAnswerIntoArchive({
  terminalStatus,
  qualityGate,
  legacyFallbackUsed: false,
  sourceContract,
  finalAnswer: finalVisibleAnswerPreview,
});

const result = {
  metadataMarkerValid: Boolean(parsed?.runId === "smoke_run"),
  rawMetadataWouldRender: /BESTDEL_PIPELINE|sourceContract|citationEligibleSources/.test(finalVisibleAnswerPreview),
  coreGenerationUsed: parsed?.coreGenerationUsed,
  legacyFallbackUsed: parsed?.legacyFallbackUsed,
  qualityGatePassed: parsed?.qualityGate?.passed,
  repairRequired: parsed?.qualityGate?.repairRequired,
  sourceContractStatus: parsed?.sourceContract.status,
  sourceGapReport: Boolean(parsed?.sourceGapReport),
  finalUniqueCitedSources: parsed?.sourceContract.finalUniqueCitedSources,
  terminalStatus,
  canMergeIntoArchive,
  finalVisibleAnswerPreview,
};

console.log(JSON.stringify(result, null, 2));

const failures = [
  !result.metadataMarkerValid && "marker mismatch",
  result.rawMetadataWouldRender && "raw metadata visible",
  result.qualityGatePassed === false && terminalStatus === "completed" && "quality failure marked completed",
  result.legacyFallbackUsed === true && terminalStatus === "completed" && "legacy fallback marked completed",
  sourceContract.finalUniqueCitedSources < sourceContract.requiredSources && sourceContract.status === "passed" && "source gap marked strict pass",
  /^# Research Incomplete\b|Legacy fallback answer retained/i.test(finalVisibleAnswerPreview) && "fallback text shown as final answer",
].filter(Boolean);

if (failures.length > 0) {
  console.error(`visible research smoke failed: ${failures.join(", ")}`);
  process.exit(1);
}
