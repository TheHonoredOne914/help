import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";
import { runThesisQualityGate } from "../../src/core/verification/thesis-quality-gate.js";

test("phd/full answer with fewer than 20 cited sources cannot pass without SourceGapReport", () => {
  const contract = buildAgendaContract({ requestId: "bucket-gates", originalUserQuery: "India democratic space 2022-2025", outputDepth: "deep_research" });
  contract.minimumUniqueCitedSources = 30;
  const registry = buildEvidenceRegistryFromSources([], contract);
  const gate = runThesisQualityGate("# Executive Thesis\nNo citations.", contract, registry, {
    uniqueCitedSourceIds: [],
    citedBucketIds: [],
    modelRoleOutputs: [],
  });
  assert.equal(gate.passed, false);
  assert.match(gate.automaticFailures.join("\n"), /zero valid citations|mode minimum 30/i);
});
