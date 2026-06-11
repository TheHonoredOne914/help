import { buildAgendaContract } from "../src/core/agenda/agenda-contract.js";
import { generateResearchAngles } from "../src/core/archive/research-angle-engine.js";
import { buildBucketedQueryPlan } from "../src/core/retrieval/query-planner.js";
import { buildContextualTopUpQuery, type RetrievalSource } from "../src/core/retrieval/bucketed-retrieval.js";
import { buildMultiHopExpansion } from "../src/core/retrieval/multi-hop-expander.js";
import { dedupeByContentSimilarity } from "../src/core/retrieval/source-deduper.js";

const mode = "council";
const contract = buildAgendaContract({
  requestId: "smoke-retrieval-quality",
  originalUserQuery: "Indian democratic space, internet shutdowns, press freedom, ECI defence, Supreme Court doctrine, and federalism objections.",
});
const plan = buildBucketedQueryPlan(contract, mode);
const angles = generateResearchAngles({ agendaContract: contract, archiveRouting: null });

const round1Results: RetrievalSource[] = [
  source(1, "Anuradha Bhasin v Union of India internet shutdown judgment", "https://indiankanoon.org/doc/82461587/", "court_legal", "court_primary", "The Supreme Court considered internet shutdown proportionality in Anuradha Bhasin v Union of India."),
  source(2, "Freedom House India 2025 score", "https://freedomhouse.org/country/india/freedom-world/2025", "democracy_index", "democracy_index", "Freedom House India score and civil liberties assessment."),
  source(3, "V-Dem Democracy Report 2025 India", "https://v-dem.net/publications/democracy-reports/", "democracy_index", "democracy_index", "V-Dem reports India democracy index data for 2025."),
  source(4, "Representation of the People Act election integrity", "https://eci.gov.in/example", "electoral_integrity", "electoral_body", "Election Commission position on electoral process and EVM safeguards."),
];
const topUpExamples = ["court_legal", "democracy_index", "government_official", "electoral_integrity"].map((bucketId) => ({
  bucketId,
  query: buildContextualTopUpQuery(bucketId as any, contract, round1Results),
}));
const expansion = buildMultiHopExpansion({
  round1Results,
  agendaContract: contract,
  weakBuckets: ["court_legal", "democracy_index", "electoral_integrity"],
  researchAngles: angles,
});
const expansionCount = Object.values(expansion).flat().length;
const deduped = dedupeByContentSimilarity([
  source(10, "Press freedom India ranking report", "https://example.org/a", "press_freedom", "indian_major_media", "India press freedom ranking and journalist safety concerns are described in this source."),
  source(11, "Press freedom India ranking report", "https://example.net/b", "press_freedom", "indian_major_media", "India press freedom ranking and journalist safety concerns are described in this source."),
  source(12, "ECI official VVPAT FAQ", "https://eci.gov.in/vvpat", "electoral_integrity", "electoral_body", "Official ECI VVPAT process explanation."),
]);

const summary = {
  mode,
  providerHealthSummary: "local retrieval planner smoke - no search API key used",
  retrievalQueryCount: plan.queries.length,
  bucketCount: plan.buckets.length,
  topUpQueryExamples: topUpExamples,
  multiHopExpansionCount: expansionCount,
  expansionBreakdown: {
    entity: expansion.entityQueries.length,
    case: expansion.caseQueries.length,
    index: expansion.indexQueries.length,
    contrarian: expansion.contrarianQueries.length,
  },
  nearDuplicateInputCount: 3,
  nearDuplicateOutputCount: deduped.length,
};

console.log(JSON.stringify(summary, null, 2));

if (plan.queries.length < 40) throw new Error("retrieval query plan is too small for FullSpectrum");
if (topUpExamples.some((item) => /\bsource evidence\b/i.test(item.query))) throw new Error("context-blind top-up query detected");
if (expansionCount < 2) throw new Error("multi-hop expansion did not produce targeted follow-up queries");
if (deduped.length >= 3) throw new Error("content similarity dedupe did not remove near duplicate");
console.log("smoke:retrieval-quality passed");

function source(
  id: number,
  title: string,
  url: string,
  bucketId: RetrievalSource["bucketIds"][number],
  sourceClass: RetrievalSource["sourceClass"],
  snippet: string,
): RetrievalSource {
  return {
    title,
    url,
    snippet,
    bucketId,
    provider: "mock",
    canonicalUrl: url,
    bucketIds: [bucketId],
    foundByQueries: [title],
    score: sourceClass === "court_primary" || sourceClass === "democracy_index" ? 90 : 75,
    sourceClass,
    scoreReasons: ["smoke fixture"],
    citationEligible: true,
  };
}
