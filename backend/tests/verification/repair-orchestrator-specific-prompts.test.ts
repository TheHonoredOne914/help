import test from "node:test";
import assert from "node:assert/strict";
import { buildRepairPromptTemplate } from "../../src/core/verification/repair-orchestrator.js";

test("repair prompt templates are issue specific", () => {
  assert.match(buildRepairPromptTemplate("citation_repair"), /invalid citations/i);
  assert.match(buildRepairPromptTemplate("electoral_caution_repair"), /fraud/i);
  assert.match(buildRepairPromptTemplate("d11_structure_repair"), /Diagnosis, Prescription, Warning/i);
  assert.notEqual(buildRepairPromptTemplate("citation_repair"), buildRepairPromptTemplate("legal_accuracy_repair"));
});
