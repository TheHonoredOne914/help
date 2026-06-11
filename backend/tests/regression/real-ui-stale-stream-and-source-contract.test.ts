import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildBucketedQueryPlan } from "../../src/core/retrieval/query-planner.js";
import { runSearchPlan } from "../../src/core/retrieval/search-executor.js";

const root = path.resolve(process.cwd(), "..");

test("real UI route sends researchMode and run-scopes stream events", () => {
  const chatArea = fs.readFileSync(path.join(root, "frontend/src/components/chat/chat-area.tsx"), "utf8");
  assert.match(chatArea, /researchMode:\s*mode === "normal" \? undefined : mode/);
  assert.match(chatArea, /SET_ACTIVE_RUN/);
  assert.match(chatArea, /IGNORED_STALE_EVENT/);
  assert.match(chatArea, /data\.runId === active\.runId/);
  assert.doesNotMatch(chatArea, /type ChatMode = "normal" \| "web_search" \| "deep_research"/);
});

test("backend research route defaults to core pipeline instead of legacy multi-search", () => {
  const service = fs.readFileSync(path.join(root, "backend/src/services/anthropic-service.ts"), "utf8");
  const coreRouteIndex = service.indexOf("USE_CORE_RESEARCH_ROUTE");
  const legacyRouteIndex = service.indexOf("await handleMultiSearch");
  assert.ok(coreRouteIndex > 0, "core route flag must exist");
  assert.ok(legacyRouteIndex > coreRouteIndex, "legacy multi-search must be after the core route gate");
  assert.match(service, /assistantMessageId/);
  assert.match(service, /run_started/);
});

test("council democratic-space planner produces broad bucketed query plan", () => {
  const contract = buildAgendaContract({
    requestId: "regression-full-spectrum",
    originalUserQuery: "Analyze India's declining democratic space from 2022-2025 using Freedom House, V-Dem, EIU, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, EVM/VVPAT allegations, electoral bonds, RSF, EPW, MHA, ECI, The Hindu, and Indian Express.",
    outputDepth: "deep_research",
  });
  const plan = buildBucketedQueryPlan(contract, "council");
  const uniqueQueries = new Set(plan.queries.map((query) => query.query.toLowerCase()));
  const bucketIds = new Set(plan.buckets.map((bucket) => bucket.id));
  assert.ok(uniqueQueries.size >= 80, `expected 80+ unique queries, got ${uniqueQueries.size}`);
  assert.equal(plan.queries.length - uniqueQueries.size <= Math.ceil(plan.queries.length * 0.1), true);
  for (const required of ["court_legal", "government_official", "electoral_integrity", "academic_research", "indian_major_media"]) {
    assert.ok(bucketIds.has(required as any), `missing ${required}`);
  }
  const allQueries = [...uniqueQueries].join("\n");
  assert.doesNotMatch(allQueries, /hi india ncrb statistics data cag\.gov\.in/i);
});

test("production search refuses deterministic fallback when mock is disabled", async () => {
  const contract = buildAgendaContract({ requestId: "no-mock", originalUserQuery: "India democratic space 2025" });
  const plan = { ...buildBucketedQueryPlan(contract, "fast_research"), queries: buildBucketedQueryPlan(contract, "fast_research").queries.slice(0, 2) };
  const errors: string[] = [];
  const results = await runSearchPlan(plan, {
    live: false,
    allowMock: false,
    onProviderError: (error) => errors.push(error),
  });
  assert.deepEqual(results, []);
  assert.match(errors.join("\n"), /mock search disabled/i);
});
