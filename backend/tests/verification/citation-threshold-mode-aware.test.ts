import test from "node:test";
import assert from "node:assert/strict";
import { validateCitations } from "../../src/core/verification/citation-validator.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

test("fast_research with 12 valid unique citations passes without hardcoded 30 linked citations", () => {
  const run = createFakeResearchRun(20, "fast_research");
  run.agendaContract.minimumUniqueCitedSources = 12;
  const citations = run.evidenceRegistry.getCitationEligibleSources()
    .slice(0, 12)
    .map((source) => run.evidenceRegistry.getCitationMarkdown(source.id))
    .join(" ");

  const report = validateCitations(`Fast research answer with valid citation coverage. ${citations}`, run.evidenceRegistry, run.agendaContract);

  assert.equal(report.uniqueCitedSourceCount, 12);
  assert.equal(report.passed, true);
});

test("repeated citation spam does not inflate unique source coverage", () => {
  const run = createFakeResearchRun(20, "deep_research");
  run.agendaContract.minimumUniqueCitedSources = 10;
  const spam = Array.from({ length: 12 }, () => run.evidenceRegistry.getCitationMarkdown(1)).join(" ");

  const report = validateCitations(`Answer with repeated citation spam. ${spam}`, run.evidenceRegistry, run.agendaContract);

  assert.equal(report.uniqueCitedSourceCount, 1);
  assert.equal(report.passed, false);
  assert.match(report.invalidCitations.join("\n"), /repeated citation spam|fewer/i);
});
