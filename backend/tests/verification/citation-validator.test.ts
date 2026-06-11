import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { linkBareSourceCitations, validateCitations } from "../../src/core/verification/citation-validator.js";

test("citation validator rejects fake and bare citations and accepts registry links", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem Supreme Court ECI" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);

  const bad = validateCitations("India declined [1]. Fake source [Source 37].", registry, contract);
  assert.equal(bad.passed, false);
  assert.ok(bad.rejectedCitations.length >= 2);

  const goodText = Array.from({ length: 30 }, (_, index) => registry.getCitationMarkdown(index + 1)).join(" ");
  const good = validateCitations(`India democratic-space evidence base. ${goodText}`, registry, contract);
  assert.equal(good.passed, true);
  assert.equal(good.uniqueCitedSourceCount, 30);
});

test("bare Source N tags can be linked only through real registry sources", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem Supreme Court ECI" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);

  const linked = linkBareSourceCitations("ECI claim [Source 1]. Fake claim [Source 999]. Generic footnote [1].", registry);

  assert.match(linked, /\[Source 1\]\(https?:\/\/[^)]+\)/);
  assert.match(linked, /\[Source 999\]/);
  assert.match(linked, /\[1\]/);
});

test("model source brackets are normalized to registry markdown links", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem Supreme Court ECI" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);

  const linked = linkBareSourceCitations("ECI claim 【Source 1】 and mojibake claim ã€Source 2ã€‘.", registry);

  assert.match(linked, /\[Source 1\]\(https?:\/\/[^)]+\)/);
  assert.match(linked, /\[Source 2\]\(https?:\/\/[^)]+\)/);
});
