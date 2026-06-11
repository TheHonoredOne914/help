import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { runHallucinationGuard } from "../../src/core/verification/hallucination-guard.js";

test("hallucination guard catches fake citation, article, statistic, UN framing, and overclaim", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India electoral integrity Article 19 Supreme Court" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "ECI VVPAT safeguards",
    url: "https://eci.gov.in/vvpat",
    snippet: "ECI described VVPAT safeguards and election process.",
    sourceClass: "electoral_body",
    bucketIds: ["electoral_integrity"],
  } as any], contract);
  const report = runHallucinationGuard("Article 99 proves it. India ranked 157th out of 180. Member states should pass a UN resolution. EVMs were manipulated [Source 99](https://fake.example).", registry);

  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => issue.type === "invalid_citation"));
  assert.ok(report.issues.some((issue) => issue.type === "fake_article"));
  assert.ok(report.issues.some((issue) => issue.type === "unsupported_statistic"));
  assert.ok(report.issues.some((issue) => issue.type === "un_framing"));
  assert.ok(report.issues.some((issue) => issue.type === "overclaim"));
});

test("hallucination guard flags unsupported case names and unsupported legal holdings", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India speech restrictions Article 19" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Article 19 explainer",
    url: "https://prsindia.org/article-19",
    snippet: "Article 19 covers speech restrictions and parliamentary policy debate.",
    sourceClass: "policy_research",
    bucketIds: ["policy_research"],
  } as any], contract);

  const report = runHallucinationGuard(
    "Example Rao v Union of India held that all internet shutdowns are automatically unconstitutional under Article 19.",
    registry,
  );

  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => issue.type === "ungrounded_case"));
  assert.ok(report.issues.some((issue) => issue.type === "unsupported_legal_holding"));
});
