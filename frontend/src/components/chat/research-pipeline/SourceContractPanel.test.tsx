import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceContractPanel } from "./SourceContractPanel";

test("SourceContractPanel handles null safely", () => {
  assert.equal(renderToStaticMarkup(<SourceContractPanel contract={null} gapReport={null} />), "");
});

test("SourceContractPanel shows source counts and missing buckets", () => {
  const html = renderToStaticMarkup(<SourceContractPanel
    contract={{
      requiredEvidenceCardsPerModel: 3,
      requiredUniqueCitedSources: 30,
      citationEligibleSources: 18,
      roles: [{ roleName: "agenda", sourceCountUsed: 4, passed: false, sourceGapReason: "Missing court sources" }],
    }}
    gapReport={{
      requiredUniqueSources: 30,
      availableCitationEligibleSources: 18,
      failedBuckets: ["court_legal"],
      weakBuckets: ["academic_research"],
      explanation: "Limited available evidence",
    }}
  />);

  assert.match(html, /18 eligible \/ 30 cited target/);
  assert.match(html, /0\/1 roles passed/);
  assert.match(html, /court legal/);
  assert.doesNotMatch(html, /\{&quot;|\{"requiredUniqueSources"/);
});
