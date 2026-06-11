import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { getSourceBucketsForAgenda } from "../../src/core/retrieval/source-buckets.js";

function bucketIds(query: string): string[] {
  return getSourceBucketsForAgenda(buildAgendaContract({ requestId: query, originalUserQuery: query }))
    .map((bucket) => bucket.id);
}

test("GST federalism query uses economy and federalism buckets", () => {
  const ids = bucketIds("GST federalism and Centre-State financial relations");

  assert.ok(ids.includes("government_official"));
  assert.ok(ids.includes("parliamentary_records"));
  assert.ok(ids.includes("policy_research"));
  assert.ok(ids.includes("academic_research"));
  assert.ok(ids.includes("indian_major_media"));
});

test("AFSPA Manipur query uses security, legal, media, and watchdog buckets", () => {
  const ids = bucketIds("AFSPA Manipur public order Article 21 national security");

  assert.ok(ids.includes("government_official"));
  assert.ok(ids.includes("court_legal"));
  assert.ok(ids.includes("human_rights_watchdog"));
  assert.ok(ids.includes("indian_major_media"));
});

test("Article 356 query uses constitutional, federalism, and legal buckets", () => {
  const ids = bucketIds("Article 356 and federalism in India");

  assert.ok(ids.includes("court_legal"));
  assert.ok(ids.includes("parliamentary_records"));
  assert.ok(ids.includes("policy_research"));
  assert.ok(ids.includes("legal_commentary"));
});

test("India-China LAC query uses foreign and security buckets", () => {
  const ids = bucketIds("India-China LAC border status and foreign policy");

  assert.ok(ids.includes("government_official"));
  assert.ok(ids.includes("policy_research"));
  assert.ok(ids.includes("indian_major_media"));
  assert.ok(ids.includes("academic_research"));
});
