import test from "node:test";
import assert from "node:assert/strict";
import { runHallucinationGuard } from "../../src/core/verification/hallucination-guard.js";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";

test("fake 43% does not pass because unrelated 1943 exists", () => {
  const contract = buildAgendaContract({ requestId: "number-support", originalUserQuery: "India economic policy statistics" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Historical report",
    url: "https://data.gov.in/report",
    snippet: "The dataset references the year 1943 but no percentage figure.",
    fullText: "The dataset references the year 1943 but no percentage figure.",
    keyNumbers: ["1943"],
    bucketIds: ["government_official"],
    sourceClass: "official_government",
    citationEligible: true,
  }], contract);

  const report = runHallucinationGuard("The policy improved by 43% [Source 1](https://data.gov.in/report).", registry);

  assert.equal(report.issues.some((issue) => issue.type === "unsupported_statistic" && issue.evidence === "43%"), true);
});

test("Article claim requires legal or official support near registry evidence", () => {
  const contract = buildAgendaContract({ requestId: "article-support", originalUserQuery: "Article 356 and federalism" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Generic policy article",
    url: "https://example.org/policy",
    snippet: "Federalism debate with no constitutional article support.",
    fullText: "Federalism debate with no constitutional article support.",
    bucketIds: ["policy_research"],
    sourceClass: "policy_research",
    citationEligible: true,
  }], contract);

  const report = runHallucinationGuard("Article 356 allows President's Rule [Source 1](https://example.org/policy).", registry);

  assert.equal(report.issues.some((issue) => issue.type === "ungrounded_article"), true);
});
