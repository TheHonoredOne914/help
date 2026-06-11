import test from "node:test";
import assert from "node:assert/strict";
import { buildClaimGraph } from "../../../src/core/evidence/claim-graph.js";
import { createClaimGraphFixture } from "./helpers.js";

test("EvidenceCard fields are ingested and snippet-only legal claims are low confidence", () => {
  const fixture = createClaimGraphFixture();
  const graph = buildClaimGraph(fixture.evidenceRegistry, fixture.agendaContract, { evidencePacks: fixture.evidencePacks });
  assert.ok((graph.diagnostics?.evidenceCardClaimCount ?? 0) > 0);
  assert.ok(graph.claims.some((claim) => /Snippet-only legal holding/i.test((claim.limitations ?? []).join(" ")) && claim.confidence === "low"));
});
