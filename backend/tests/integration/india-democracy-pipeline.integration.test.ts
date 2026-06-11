import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { runResearchPipeline } from "../../src/core/pipeline/research-pipeline.js";

test("India democracy pipeline enforces agenda, evidence packs, deep source contract, citations, and quality gate", async () => {
  const events: string[] = [];
  const result = await runResearchPipeline({
    requestId: "test-india-democracy",
    userQuery: "Analyze India's declining democratic space from 2022-2025 through Freedom House, V-Dem, EIU, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, World Press Freedom Index, electoral integrity, EPW, MHA, court databases, The Hindu, Indian Express, and comparative democracy reports.",
    mode: "deep_research",
    preloadedSources: fixtureSources as any,
    emit: (event) => events.push(event.type),
  });

  assert.equal(result.agendaContract.topicType, "indian_democratic_space");
  assert.ok(result.evidenceRegistry.getCitationEligibleCount() >= 40);
  assert.ok(result.modelRoleOutputs.every((role) => role.sourceRequirementSatisfied));
  assert.equal(result.agendaContract.minimumUniqueCitedSources, 20);
  assert.ok(result.sourceUsageAggregate.passed);
  assert.ok(result.sourceUsageAggregate.validUsageCount >= 20);
  assert.ok(result.citationReport.uniqueCitedSourceCount >= 20);
  assert.equal(result.qualityGate.passed, true);
  for (const event of ["request_received", "agenda_contract_created", "source_bucket_plan_created", "evidence_registry_created", "source_usage_map_created", "citation_audit_started", "quality_gate_completed", "final_answer_ready"]) {
    assert.ok(events.includes(event), `missing event ${event}`);
  }
});
