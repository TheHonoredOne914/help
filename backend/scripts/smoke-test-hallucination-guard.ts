import { buildAgendaContract } from "../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources, type EvidenceSource } from "../src/core/evidence/evidence-registry.js";
import { runHallucinationGuard } from "../src/core/verification/hallucination-guard.js";

const contract = buildAgendaContract({
  requestId: "smoke-hallucination-guard",
  originalUserQuery: "Indian Mock Parliament brief on ECI accountability, Article 19, Article 21, and Supreme Court doctrine.",
});
const sources: EvidenceSource[] = [
  source(1, "Election Commission EVM FAQ", "https://eci.gov.in/evm-faq", "electoral_integrity", "electoral_body", "ECI explains EVM and VVPAT safeguards."),
  source(2, "Supreme Court Shreya Singhal", "https://indiankanoon.org/doc/110813550/", "court_legal", "court_primary", "Shreya Singhal v Union of India discusses Article 19 speech protections."),
  source(3, "Freedom House India 2025", "https://freedomhouse.org/country/india/freedom-world/2025", "democracy_index", "democracy_index", "Freedom House gives India civil liberties assessment data."),
];
const registry = buildEvidenceRegistryFromSources(sources, contract);
const suspectText = [
  "The report cites a fake registry item [Source 99](https://fake.example/source).",
  "Article 99 creates a constitutional challenge.",
  "Imaginary Case v Union of India settled the doctrine.",
  "India ranked 157th out of 180 and therefore EVM fraud happened.",
  "The Security Council and member states must pass a UN resolution.",
  "A mismatched citation points to [Source 1](https://wrong.example/evm).",
].join(" ");

const report = runHallucinationGuard(suspectText, registry);
const summary = {
  mode: "guard_smoke",
  providerHealthSummary: "local verifier smoke - no API key used",
  hallucinationIssues: report.issues.map((issue) => ({
    type: issue.type,
    severity: issue.severity,
    evidence: issue.evidence,
  })),
  criticalIssueCount: report.criticalIssues.length,
  passed: report.passed,
};

console.log(JSON.stringify(summary, null, 2));

const types = new Set(report.issues.map((issue) => issue.type));
for (const required of ["invalid_citation", "citation_url_mismatch", "fake_article", "ungrounded_case", "unsupported_statistic", "un_framing", "overclaim"]) {
  if (!types.has(required)) throw new Error(`hallucination guard did not catch ${required}`);
}
if (report.passed) throw new Error("hallucination guard smoke should fail suspect text");
console.log("smoke:hallucination-guard passed");

function source(
  id: number,
  title: string,
  url: string,
  bucketId: EvidenceSource["bucketIds"][number],
  sourceClass: EvidenceSource["sourceClass"],
  fullText: string,
): EvidenceSource {
  return {
    id,
    title,
    url,
    canonicalUrl: url,
    domain: new URL(url).hostname,
    bucketIds: [bucketId],
    sourceClass,
    authorityScore: 90,
    date: "2025-01-01",
    fullText,
    snippet: fullText,
    extractionQuality: "full",
    keyFacts: [fullText],
    keyNumbers: [],
    legalHoldings: sourceClass === "court_primary" ? [fullText] : [],
    namedEntities: [],
    limitations: [],
    confidence: "high",
    citationEligible: true,
  };
}
