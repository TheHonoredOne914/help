import test from "node:test";
import assert from "node:assert/strict";
import { selectRoleOutputsForDivision } from "../../../src/core/synthesis/role-generation/role-division-router.js";
import type { SourceUsageMapItem } from "../../../src/core/evidence/source-usage-map.js";
import { roleOutput } from "./helpers.js";

const item: SourceUsageMapItem = {
  sourceId: 1,
  title: "Source",
  bucketIds: ["policy_research"],
  sourceClass: "policy_research",
  usageType: "fact_extracted",
  extractedClaim: "Grounded claim",
  confidence: "medium",
};

test("division router sends D7 and D11 to the required role outputs", () => {
  const outputs = [
    roleOutput("indian_parliamentary_strategist", item),
    roleOutput("legal_analyst", item),
    roleOutput("data_analyst", item),
    roleOutput("thesis_synthesizer", item),
    roleOutput("retrieval_critic", item),
    roleOutput("citation_auditor", item),
    roleOutput("evidence_extractor", item),
  ];

  assert.deepEqual(selectRoleOutputsForDivision("D7_debate_utility", outputs).map((output) => output.roleName), [
    "indian_parliamentary_strategist",
    "legal_analyst",
    "data_analyst",
  ]);
  assert.deepEqual(selectRoleOutputsForDivision("D11_strategic_insights", outputs).map((output) => output.roleName), [
    "thesis_synthesizer",
    "retrieval_critic",
    "citation_auditor",
  ]);
});
