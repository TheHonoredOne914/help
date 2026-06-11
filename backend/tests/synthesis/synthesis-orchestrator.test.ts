import test from "node:test";
import assert from "node:assert/strict";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";
import { buildSourceUsageMapFromRegistry } from "../../src/core/evidence/source-usage-map.js";
import { buildClaimLedger } from "../../src/core/evidence/claim-ledger.js";
import { runDivisionSynthesisOrchestrator } from "../../src/core/synthesis/synthesis-orchestrator.js";

test("division synthesis orchestrator calls DIVISION_REGISTRY instructions and orders D7/D11 last", () => {
  const { agendaContract, evidenceRegistry, evidencePacks, claimGraph } = createFakeResearchRun(12, "deep_research");
  const modelRoleOutputs = [
    buildSourceUsageMapFromRegistry("evidence_extractor", evidenceRegistry, agendaContract, 8),
    buildSourceUsageMapFromRegistry("indian_parliamentary_strategist", evidenceRegistry, agendaContract, 8),
  ];
  const claimLedger = buildClaimLedger(modelRoleOutputs, evidenceRegistry);

  const result = runDivisionSynthesisOrchestrator({
    agendaContract,
    evidenceRegistry,
    evidencePacks,
    claimGraph,
    claimLedger,
    modelRoleOutputs,
    userQuery: agendaContract.originalUserQuery,
    mode: "deep_research",
  });

  assert.ok(result.divisionOutputs.has("core_brief"));
  assert.ok(result.divisionOutputs.has("debate_utility"));
  assert.ok(result.divisionOutputs.has("strategic_insights"));
  assert.match(result.diagnostics.instructionByDivisionId.core_brief, /Generate DIVISION 1/i);
  assert.match(result.divisionOutputs.get("debate_utility") ?? "", /Treasury Bench|Opposition|POIs|rebuttal|amendment/i);
  assert.match(result.divisionOutputs.get("strategic_insights") ?? "", /Diagnosis|Prescription|Warning/i);
  assert.ok(result.diagnostics.divisionOrder.indexOf("debate_utility") > result.diagnostics.divisionOrder.indexOf("evidence_verification"));
  assert.equal(result.diagnostics.divisionOrder.at(-1), "strategic_insights");
});
