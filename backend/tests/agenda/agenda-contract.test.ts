import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract, assertAgendaLock } from "../../src/core/agenda/agenda-contract.js";

const democracyQuery = "Analyze India's declining democratic space from 2022-2025 through Freedom House, V-Dem, EIU, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, World Press Freedom Index, electoral integrity, EPW, MHA, court databases, The Hindu, Indian Express, and comparative democracy reports.";

test("buildAgendaContract locks India democratic-space agenda to Indian Mock Parliament thesis mode", () => {
  const contract = buildAgendaContract({ originalUserQuery: democracyQuery });

  assert.equal(contract.committeeSystem, "indian_mock_parliament");
  assert.equal(contract.topicType, "indian_democratic_space");
  assert.equal(contract.countryFocus, "India");
  assert.deepEqual(contract.temporalScope, { startYear: 2022, endYear: 2025, explicit: true });
  assert.equal(contract.outputDepth, "deep_research");
  assert.equal(contract.evidenceStandard, "thesis");
  assert.equal(contract.debateMode, "indian_parliamentary");
  assert.equal(contract.minimumUniqueCitedSources, 30);
  assert.equal(contract.minimumEvidenceCardsPerModel, 30);
  for (const entity of ["Freedom House", "V-Dem", "EIU Democracy Index", "UAPA", "FCRA", "Supreme Court of India", "World Press Freedom Index", "EPW", "The Hindu", "Indian Express"]) {
    assert.ok(contract.requiredEntities.includes(entity), `missing required entity ${entity}`);
  }
});

test("assertAgendaLock fails AI drift and UN framing for India democratic-space contract", () => {
  const contract = buildAgendaContract({ originalUserQuery: democracyQuery });
  const report = assertAgendaLock("This UN resolution on generative AI, member states, algorithmic bias, and AI governance should guide the international community.", contract);

  assert.equal(report.passed, false);
  assert.ok(report.detectedDriftTerms.includes("generative AI"));
  assert.ok(report.detectedDriftTerms.includes("UN resolution"));
  assert.ok(report.missingEntities.includes("Freedom House"));
  assert.equal(report.actionRequired, "repair");
});

test("deepfake election agenda allows directly relevant AI-generated terms", () => {
  const contract = buildAgendaContract({
    originalUserQuery: "Should the Election Commission regulate AI-generated deepfakes and online political advertising during Indian elections?",
    outputDepth: "detailed",
  });

  assert.doesNotMatch(contract.forbiddenDriftTerms.join(" "), /\bAI-generated\b/i);
  assert.doesNotMatch(contract.forbiddenDriftTerms.join(" "), /\bartificial intelligence\b/i);
  assert.doesNotMatch(contract.forbiddenDriftTerms.join(" "), /\bdeepfakes\b/i);
  assert.match(contract.forbiddenDriftTerms.join(" "), /\bAI governance\b/i);
});
