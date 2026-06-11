import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { classifySource, scoreSourceForAgenda } from "../../src/core/retrieval/source-scoring.js";

test("social media is classified separately and does not count as official government", () => {
  assert.equal(classifySource("facebook.com"), "social_media");
  assert.equal(classifySource("x.com"), "social_media");
  assert.equal(classifySource("linkedin.com"), "social_media");
  assert.notEqual(classifySource("facebook.com"), "official_government");
});

test("Wikipedia is low-quality context and not citation eligible proof", () => {
  assert.equal(classifySource("en.wikipedia.org"), "low_quality");
  const contract = buildAgendaContract({ originalUserQuery: "India UGC higher education regulation", outputDepth: "detailed" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "University Grants Commission (India) - Wikipedia",
    url: "https://en.wikipedia.org/wiki/University_Grants_Commission_(India)",
    snippet: "UGC is a statutory body in India.",
    sourceClass: "general_media",
    citationEligible: true,
  }], contract);

  assert.equal(registry.sources[0]?.sourceClass, "low_quality");
  assert.equal(registry.sources[0]?.citationEligible, false);
});

test("legal and policy sources are classified into the right buckets", () => {
  assert.equal(classifySource("sci.gov.in"), "court_primary");
  assert.equal(classifySource("api.sci.gov.in"), "court_primary");
  assert.equal(classifySource("scobserver.in"), "legal_commentary");
  assert.equal(classifySource("scconline.com"), "legal_commentary");
  assert.equal(classifySource("prsindia.org"), "policy_research");
});

test("unknown domains normalize as general media and do not satisfy source buckets", () => {
  assert.equal(classifySource("unknown-example.net"), "general_media");

  const contract = buildAgendaContract({ originalUserQuery: "India UAPA parliamentary accountability", outputDepth: "detailed" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Unknown site article",
    url: "https://unknown-example.net/story",
    snippet: "A general article mentioning India Parliament without source authority.",
  }], contract);

  assert.equal(registry.sources[0]?.sourceClass, "general_media");
  assert.equal(registry.sources[0]?.citationEligible, false);
  assert.deepEqual(registry.sources[0]?.bucketIds, []);
});

test("social media is not citation eligible by default in evidence registry", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India UAPA parliamentary accountability", outputDepth: "detailed" });
  const registry = buildEvidenceRegistryFromSources([{
    title: "Facebook post",
    url: "https://facebook.com/example/posts/1",
    snippet: "A post mentioning India Parliament.",
  }], contract);

  assert.equal(registry.sources[0]?.sourceClass, "social_media");
  assert.equal(registry.sources[0]?.citationEligible, false);
});

test("irrelevant broad sources receive a low score", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India UAPA parliamentary accountability", outputDepth: "detailed" });
  const scored = scoreSourceForAgenda({
    title: "Generic social post",
    url: "https://facebook.com/example",
    snippet: "Random content with no legal or parliamentary source value.",
  }, contract);

  assert.equal(scored.sourceClass, "social_media");
  assert.ok(scored.score < 40);
});
