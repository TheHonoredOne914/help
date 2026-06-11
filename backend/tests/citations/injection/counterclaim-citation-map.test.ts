import test from "node:test";
import assert from "node:assert/strict";
import { buildCounterclaimCitationMap, findCounterclaimCitationViolations, getCounterclaimCitationMarkdown } from "../../../src/core/citations/injection/counterclaim-citation-map.js";
import type { ClaimGraph } from "../../../src/core/evidence/claim-graph/types.js";
import type { EvidenceRegistryCore } from "../../../src/core/evidence/evidence-registry.js";

const mockRegistry = {
  getSource: (id: number) => {
    if (id <= 5) return { id, citationEligible: true, url: `https://source${id}.com` };
    return null;
  },
  getCitationMarkdown: (id: number) => `[Source ${id}](https://source${id}.com)`,
} as unknown as EvidenceRegistryCore;

  const graph: ClaimGraph = {
    claims: [
      { id: "c1", text: "Government passed the act", type: "fact", requiredSourceClasses: [], supportingSourceIds: [1, 2], confidence: "high", mustUseCarefulLanguage: false, forbiddenIfUnsupported: false, supportScore: 80 },
    ],
    counterclaims: [
      { id: "cc1", text: "The act violates rights", challengedClaimId: "c1", sourceIds: [3, 4], sourceClasses: ["human_rights_watchdog"], supportScore: 70, requiresCarefulLanguage: false },
      { id: "cc2", text: "No evidence of improvement", challengedClaimId: "c1", sourceIds: [1], sourceClasses: ["court_primary"], supportScore: 50, requiresCarefulLanguage: false }, // Uses original claim's source
    ],
  };

test("builds counterclaim map with separate sources", () => {
  const entries = buildCounterclaimCitationMap(graph, mockRegistry);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].counterclaimSourceIds, [3, 4]);
  assert.deepEqual(entries[0].originalClaimSourceIds, [1, 2]);
});

test("returns citation markdown for counterclaim", () => {
  const entries = buildCounterclaimCitationMap(graph, mockRegistry);
  const md = getCounterclaimCitationMarkdown("cc1", entries, mockRegistry);
  assert.match(md, /\[Source 3\]/);
  assert.match(md, /\[Source 4\]/);
});

test("detects violations when counterclaim uses only original claim sources", () => {
  const entries = buildCounterclaimCitationMap(graph, mockRegistry);
  const violations = findCounterclaimCitationViolations(entries);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].counterclaimId, "cc2");
});
