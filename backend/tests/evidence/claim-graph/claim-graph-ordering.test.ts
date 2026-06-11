import test from "node:test";
import assert from "node:assert/strict";
import { buildClaimGraph } from "../../../src/core/evidence/claim-graph.js";
import { buildValidatedGraph, createClaimGraphFixture } from "./helpers.js";

test("ClaimGraph rebuilt after SourceUsageMap includes validated role-extracted claims", () => {
  const fixture = createClaimGraphFixture();
  const pre = buildClaimGraph(fixture.evidenceRegistry, fixture.agendaContract, { evidencePacks: fixture.evidencePacks });
  const post = buildValidatedGraph().claimGraph;
  assert.equal(pre.diagnostics?.sourceUsageClaimCount, 0);
  assert.ok((post.diagnostics?.sourceUsageClaimCount ?? 0) >= 4);
  assert.ok(post.claims.some((claim) => claim.text.includes("ADR v Election Commission") && claim.validationStatus === "approved"));
});
