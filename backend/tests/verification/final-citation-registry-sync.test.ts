import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { validateCitations } from "../../src/core/verification/citation-validator.js";

test("final citation status maps linked citations back to EvidenceRegistry sources", () => {
  const contract = buildAgendaContract({ requestId: "citation-sync", originalUserQuery: "India democratic space 2022-2025", outputDepth: "deep_research" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);
  const text = registry.getCitationEligibleSources().slice(0, 30).map((source) => registry.getCitationMarkdown(source.id)).join(" ");
  const report = validateCitations(text, registry, contract);
  assert.ok(report.uniqueCitedSourceCount >= 30);
  assert.equal(report.rejectedCitations.length, 0);
  assert.deepEqual(report.sourceIdsActuallyUsed, registry.getCitationEligibleSources().slice(0, 30).map((source) => source.id).sort((a, b) => a - b));
});
