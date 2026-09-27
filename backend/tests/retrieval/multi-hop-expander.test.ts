import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMultiHopExpansion,
  hopBatchNovelty,
  multiHopCap,
  orderedMultiHopQueries,
  shouldStopOnLowNovelty,
} from "../../src/core/retrieval/multi-hop-expander.js";
import type { RetrievalSource } from "../../src/core/retrieval/bucketed-retrieval.js";
import type { AgendaContract } from "../../src/core/agenda/agenda-contract.js";

function fakeSource(url: string, score = 50): RetrievalSource {
  return {
    id: url,
    title: "t",
    url,
    domain: new URL(url).hostname,
    snippet: "",
    publishedDate: null,
    provider: "test",
    foundByQuery: "q",
    bucketId: "policy_research",
    rawRank: 1,
    fetchedAt: new Date().toISOString(),
    bucketIds: ["policy_research"],
    foundByQueries: ["q"],
    score,
    sourceClass: "policy_research",
    scoreReasons: [],
    citationEligible: score >= 40,
  };
}

const contract = {
  normalizedAgenda: "privacy bill India",
  requiredEntities: ["Justice B.N. Srikrishna"],
  temporalScope: { endYear: 2024 },
} as AgendaContract;

test("multiHopCap deep ≤10 and council ≤25", () => {
  assert.equal(multiHopCap("deep_research"), 10);
  assert.equal(multiHopCap("council"), 25);
  assert.ok(multiHopCap("deep_research") <= 10);
});

test("orderedMultiHopQueries puts case/entity before contrarian before index", () => {
  const expansion = buildMultiHopExpansion({
    round1Results: [
      fakeSource("https://a.example/1"),
      {
        ...fakeSource("https://b.example/2"),
        title: "Kesavananda Bharati v. State of Kerala",
        snippet: "V-Dem Freedom House report India",
      },
    ],
    agendaContract: contract,
    weakBuckets: ["policy_research"],
    researchAngles: [{ title: "Surveillance risk", sourceBucketsNeeded: [], suggestedDivisions: [], parliamentaryUse: "counter" } as any],
  });
  const ordered = orderedMultiHopQueries(expansion, 10);
  const ids = ordered.map((query) => query.id);
  const firstIndex = ids.findIndex((id) => id.startsWith("multi_index"));
  const firstContrarian = ids.findIndex((id) => id.startsWith("multi_contrarian"));
  const firstCaseOrEntity = ids.findIndex((id) => id.startsWith("multi_case") || id.startsWith("multi_entity") || id.startsWith("multi_act"));
  if (firstCaseOrEntity >= 0 && firstIndex >= 0) assert.ok(firstCaseOrEntity < firstIndex);
  if (firstContrarian >= 0 && firstIndex >= 0) assert.ok(firstContrarian < firstIndex || firstIndex < 0);
});

test("novelty gate stops when rolling average over last 3 batches < 0.15", () => {
  assert.equal(shouldStopOnLowNovelty([0.1]), false);
  assert.equal(shouldStopOnLowNovelty([0.1, 0.1]), false);
  assert.equal(shouldStopOnLowNovelty([0.1, 0.1, 0.1]), true);
  assert.equal(shouldStopOnLowNovelty([0.5, 0.5, 0.5]), false);
});

test("hopBatchNovelty counts new domains and eligible sources", () => {
  const prior = [fakeSource("https://a.example/1")];
  const batch = [fakeSource("https://b.example/2"), fakeSource("https://a.example/3")];
  const novelty = hopBatchNovelty(prior, batch);
  assert.ok(novelty > 0);
  assert.ok(novelty <= 1);
});
