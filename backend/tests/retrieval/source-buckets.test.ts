import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { getSourceBucketsForAgenda } from "../../src/core/retrieval/source-buckets.js";

test("indian_democratic_space creates required source buckets with source targets", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India democratic space 2022 2025 Freedom House V-Dem UAPA FCRA Supreme Court ECI RSF Access Now EPW The Hindu Indian Express" });
  const buckets = getSourceBucketsForAgenda(contract);
  const ids = buckets.map((bucket) => bucket.id);

  for (const id of ["democracy_index", "government_official", "court_legal", "human_rights_watchdog", "civic_space", "press_freedom", "digital_rights", "electoral_integrity", "academic_research", "indian_major_media", "comparative_democracy", "parliamentary_records", "legal_commentary", "policy_research"]) {
    assert.ok(ids.includes(id as any), `missing bucket ${id}`);
  }
  assert.ok(buckets.every((bucket) => bucket.minSources > 0 && bucket.idealSources >= bucket.minSources));
  assert.ok(buckets.find((bucket) => bucket.id === "democracy_index")?.preferredDomains.includes("freedomhouse.org"));
  assert.ok(buckets.find((bucket) => bucket.id === "court_legal")?.preferredDomains.includes("sci.gov.in"));
});

test("democratic-space buckets do not hard-code stale EVM paper-ballot queries", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India press freedom UAPA FCRA civic space parliamentary accountability" });
  const queries = getSourceBucketsForAgenda(contract).flatMap((bucket) => bucket.queryTemplates);

  assert.equal(queries.some((query) => /paper ballot EVM VVPAT/i.test(query)), false);
});

test("foreign policy official bucket preserves both MEA and MOD query intents", () => {
  const contract = buildAgendaContract({ originalUserQuery: "India China LAC foreign policy diplomacy MEA parliamentary debate" });
  const buckets = getSourceBucketsForAgenda(contract);
  const official = buckets.find((bucket) => bucket.id === "government_official");

  assert.ok(official, "missing government_official bucket");
  assert.ok(official?.queryTemplates.some((query) => /site:mea\.gov\.in/i.test(query)), "missing MEA official query");
  assert.ok(official?.queryTemplates.some((query) => /site:mod\.gov\.in/i.test(query)), "missing MOD security query");
});
