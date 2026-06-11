import test from "node:test";
import assert from "node:assert/strict";
import fixtureSources from "../fixtures/india-democracy-sources.json" with { type: "json" };
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildClaimGraph, detectUnsupportedClaims } from "../../src/core/evidence/claim-graph.js";
import { buildEvidenceRegistryFromSources } from "../../src/core/evidence/evidence-registry.js";

test("claim graph detects unsupported ranks, fake judgments, and fraud overclaiming", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem ECI Supreme Court" });
  const registry = buildEvidenceRegistryFromSources(fixtureSources as any, contract);
  const graph = buildClaimGraph(registry, contract);
  const issues = detectUnsupportedClaims("India ranked 999th, the Supreme Court held in Fake Case v India that EVM fraud happened and the election was stolen.", graph, registry);

  assert.ok(issues.some((issue) => issue.type === "unsupported_rank"));
  assert.ok(issues.some((issue) => issue.type === "fake_judgment"));
  assert.ok(issues.some((issue) => issue.type === "unsupported_fraud_claim"));
});
