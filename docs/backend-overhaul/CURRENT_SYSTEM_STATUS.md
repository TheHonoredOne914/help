# Current System Status

Date: 2026-06-08

## Archive Storage Hotfix

- Archive storage now expects the Supabase schema in `backend/scripts/setup-supabase-archives.sql`.
- The prior runtime error `PGRST205: Could not find the table 'public.archives' in the schema cache` means the configured Supabase project is missing the archive/chat tables exposed through the Data API.
- `backend/src/services/anthropic-service.ts` no longer uses stale Drizzle-style `db`, `archivesTable`, `conversationsTable`, or `messagesTable` references. Conversation, message, and archive-context persistence route through `backend/src/db.ts`.
- API responses for archives, conversations, and messages are mapped from Supabase snake_case rows to the frontend camelCase contract (`archiveId`, `createdAt`, `metadataJson`, `runStatus`).
- Verification for this hotfix:
  - `npm.cmd run typecheck --prefix backend`
  - `node --import tsx --test tests\db.test.ts tests\archives.test.ts` from `backend`
  - `npm.cmd run build --prefix backend`
- Remaining deployment step: run `backend/scripts/setup-supabase-archives.sql` in the Supabase SQL Editor, or through a Postgres client using `DATABASE_URL`. This local environment has no `supabase` CLI, no exposed Supabase SQL MCP tool, and no `psql` binary, so the schema was prepared but not applied from Codex.

Date: 2026-05-31

## What Works Locally

- Persistence integrity targeted tests pass:
  - `node --import tsx --test tests/assistant-persistence.test.ts tests/archives.test.ts tests/regression/persistence-integrity-source.test.ts`
- Security/provider/retrieval regression tests for this pass pass:
  - `node --import tsx --test tests/retrieval/source-enrichment-concurrency.test.ts`
  - `node --import tsx --test tests/providers/provider-key-extraction.test.ts tests/providers/provider-status-contract-usage.test.ts tests/providers/provider-status-parallel.test.ts`
  - `node --import tsx --test tests/retrieval/search-executor.test.ts`
- Backend typecheck passes.
- Backend test suite passes: 377 tests, 372 passed, 5 live-key-gated skipped, 0 failed.
- Backend build passes.
- Frontend typecheck passed after the frontend stabilization pass.
- Frontend test script runs the dev-config checks plus TS/TSX source tests: 6 dev-config tests and 66 source tests passed, 0 failed.
- Frontend build passes with the existing large-chunk warning.
- Root `npm run build` passes.
- Requested local smoke scripts pass:
  - `smoke:provider-route-semantics`
  - `smoke:core-generation-budget`
  - `smoke:provider-fallback`
  - `smoke:fast-research-local`
  - `smoke:source-usage`
  - `smoke:visible-research-output`
  - `smoke:research-modes`
  - `smoke:division-synthesis`
  - `smoke:retrieval-quality`
  - `smoke:hallucination-guard`

## Provider Status

- The real frontend provider refresh path (`GET /api/providers/status?bypass=true&refresh=...`) now emits backend provider diagnostic logs for configured providers; provider-health status is no longer silent unless the caller only performs passive cached reads.
- Catalog fallback is display-only and is not healthy.
- Catalog fallback and unverified status are display-only for model lists and are not research-usable provider health. Research/chat usability requires `status: "healthy"` and `chatVerified: true`.
- Missing, invalid, rate-limited, network-error, unavailable, catalog-fallback, unverified, and healthy states remain distinct.
- Aggregate provider status timeout can be configured with `PROVIDER_STATUS_TIMEOUT_MS`; timeouts report `status: "timeout"`.
- Canonical key extraction includes Ollama server env fallback via `OLLAMA_API_KEY` and `OLLAMA_BASE_URL`.
- Provider status cache keys use provider labels plus SHA-256 key fingerprints, not raw key text.
- Gemini live status reports `source: "live"` when live listing succeeds.
- `smoke:research-modes` reports missing live keys in this environment but exits successfully unless `--require-live-keys` is passed.

## Research Pipeline

- Brick 7 query planning is now modularized under `backend/src/core/retrieval/query-planning/`.
- `backend/src/core/retrieval/query-planner.ts` remains a backward-compatible re-export for `buildBucketedQueryPlan`, `BucketedQueryPlan`, `BucketedQuery`, `PlannedBucketQuery`, and `PHD_RESEARCH_LIMITS`.
- Query planning now uses expanded Indian parliamentary topic classification, broad generic bucket coverage, mode-specific query text families, clean top-up queries, freshness/parliamentary builders, resolved-query drift filtering, unified dedupe, and structured query telemetry. Fast, deep, PhD, and FullSpectrum plans now differ in actual search language, not only query count.
- Empty legacy query fallback now fails fast until a topic-bearing prompt or existing query seed is available. Topic-free generic official/court queries are filtered, stale EVM paper-ballot bucket drift is removed, and foreign-policy official queries preserve both MEA and MOD intents.
- Optional LLM query expansion runs only when an eligible retrieval critic provider is already available; invalid schemas or provider errors fall back to deterministic query expansion without network calls in tests.
- Legacy role query minimums and web-search engineered fallback queries now route through official Brick 7 planner adapters, so unrelated NCRB/CAG/MEA/Freedom House fallback sets are not injected into unrelated topics such as ONDC.
- `ResearchModelPlan` now carries `webModels` into role assignments for retrieval critic, evidence extractor, thesis synthesizer, citation auditor, Indian parliamentary strategist, final quality auditor, final prose renderer, and division generator.
- Nested model IDs are split only at the first slash: `nvidia/moonshotai/kimi-k2.6` reaches core provider routing as provider `nvidia`, model `moonshotai/kimi-k2.6`.
- Catalog-fallback provider status is not generation-eligible in the model plan.
- The core pipeline emits `model_plan_validated` before source usage and passes role-specific assignments into SourceUsageMap generation where the assignment is generation-eligible.
- Partial normal-mode stream failures persist an explicit failure message instead of truncated model text.
- Research placeholders are updated by core and legacy research paths; legacy final writes no longer insert a duplicate assistant row.
- Exhausted legacy research branches persist `failed` or `completed_with_source_gaps` metadata before returning.
- Legacy fallback output is persisted as `legacy_fallback_used` and is not eligible for archive merge.
- No-key live retrieval produces an honest `SourceGapReport` at the research-pipeline boundary; strict top-up and expansion are skipped after the initial retrieval failure instead of throwing a redundant `RetrievalError`.
- Source enrichment blocks unsafe source URLs before direct fetches or Jina/Firecrawl extraction handoff, including localhost, private IP ranges, link-local metadata IPs, IPv6 loopback, credentialed URLs, internal hostnames, and non-http protocols.
- Live search provider HTTP failures are now rethrown into the search retry wrapper, so transient provider errors can recover before becoming retrieval failures.
- Fast/Web source policy is 10 target / 3 minimum-to-proceed.
- Deep source policy is 20 target / 8 minimum-to-proceed.
- PhD source policy is 30 target / 20 minimum-to-proceed and strict.
- FullSpectrum source policy is 30 target / 25 minimum-to-proceed and strict.
- Deep democratic-space no longer silently upgrades to 30.
- SourceUsageMap aggregate is based on validator-approved unique source IDs.
- Per-role source usage is mode-aware; aggregate/final contracts remain strict where needed.
- Evidence packs rotate per source-usage role so aggregate union can prove broad use without fake usage.

## Generation and Verification

- SourceUsageMap extraction output now feeds final synthesis through `ClaimLedger`; it is no longer only a validation report.
- `ClaimLedger` requires real evidence spans for citation credit, downgrades snippet/title-only support, and discards repeated generic claims item-by-item.
- `DIVISION_REGISTRY.generateInstructions()` is now called through `runDivisionSynthesisOrchestrator`; D7 is generated after the finding divisions and D11 is generated last.
- Deterministic fallback thesis text is agenda-driven and no longer hardcodes democratic-space framing for unrelated agendas such as GST/fiscal federalism.
- Live core generation cannot synthesize SourceUsageMap without explicit deterministic/test opt-in.
- Generation candidates are provider health and cooldown aware.
- Prompt budgeting is mandatory for model generation paths.
- 413 and 429 provider failures produce safe provider failure reports and interact with run-wide provider state.
- Citation validation rejects fake IDs, URL mismatches, and bare citation spam.
- Hallucination guard checks fake citations, fake Articles, unsupported cases/stats, UN framing, and electoral overclaims.
- Quality gate checks dynamic sections plus D7/D11 depth.
- Repair is issue-specific and validation reruns after repair.

## Frontend

- Fast Research uses `webSearchModels`; deep/phd/full use `deepResearchModels`; normal sends only `normalModel`.
- Mode/model selection repair is centralized in `useModeModelSelection`; stale selections are derived from live `healthyResearchModels` without a state-repair effect.
- Stream lifecycle is centralized in `useChatRunController`; `ChatArea` no longer owns abort-controller maps or the SSE parse loop.
- Stream controller cleanup is scoped: unmount aborts the mounted controller's streams, while conversation switches abort only streams owned by that conversation id.
- The daily model usage panel hydrates from localStorage in its initial state initializer, avoiding the zero-count flash.
- SSE frames are normalized before reducer dispatch; run-scoped events are keyed by `runId + assistantMessageId + conversationId`.
- Terminal status is separate from success:
  - `completed` is success.
  - `completed_with_source_gaps` and `legacy_fallback_used` are warning.
  - `provider_error` and `failed` are error.
  - `cancelled` is non-success info.
- Prompt budget reports are surfaced in the pipeline/debug panel, not in final answer text.
- Terminal error events set a local failure guard so a later generic `{ done: true }` event cannot mark partial output complete.
- Persisted assistant messages and live research answer panels strip hidden pipeline metadata before rendering or copying.
- Citation chips prefer backend `citationStatus.citedSourceIds`; regex citation parsing is fallback-only for old metadata-less messages.
- Source badges and tiering understand backend source classes such as `official_government`, `parliamentary_records`, `court_primary`, `legal_commentary`, `academic_journal`, `indian_major_media`, and `general_media`.
- Persisted pipeline metadata parsing can enforce `runId + conversationId + assistantMessageId` when those expected fields are supplied.
- The active research sidebar no longer shows static sample evidence; it renders live source/citation/status summaries or an honest no-live-sources state.
- Rhetorics regenerate preserves the last in-memory rhetorics context when available.

## Archive Safety

- Research archive merge is routed through the strict archive-merge helper.
- `completed`, quality-passed, non-fallback, strict source-contract answers may merge.
- `failed`, `provider_error`, `legacy_fallback_used`, and default `completed_with_source_gaps` outputs do not merge.
- Archive deletion now uses one atomic `deleteArchiveIfSafe` transaction outcome, so count/conversation checks and delete are not separated.

## Known Limitations

- This pass did not fully implement model-backed per-division generation, deep contradiction clustering, live provider preflight before model-plan creation, or the complete audit appendix. Those remain documented in `FULL_REPO_BUG_AUDIT.md`.
- Live key manual acceptance was not performed in this run because no provider/search keys were available in the environment.
- Browser/UI visual verification for this frontend pass passed against the built frontend shell on desktop and mobile widths.
- Vite reports a large chunk warning for the frontend bundle; build exits 0.
- Some historical docs/logs remain in `docs/backend-overhaul`; use this status doc plus the mega fix report as current truth.
- Backend `npm test` runs with `--test-concurrency=1` because provider/search tests mutate `process.env` and need deterministic file scheduling.

## Latest Verification

Latest census repair batch from 2026-05-31:

- Backend typecheck: pass.
- Provider/source/search/source-usage focused tests: pass, 23 passed, 0 failed.
- Run-state/synthesis focused tests: pass, 4 passed, 0 failed.
- Frontend source-panel/metadata/citation focused tests: pass, 6 passed, 0 failed.
- Source bucket/topic/query-planning focused tests: pass, 18 passed, 0 failed.
- Full backend test/build, full frontend typecheck/build, and root build are still pending for this specific 2026-05-31 batch.

Latest Brick 22 run-state repair results from 2026-05-30:

- Backend run-state targeted tests: pass, 12 passed, 0 failed.
- Frontend run-state/stream targeted tests: pass, 78 passed, 0 failed.
- Backend typecheck: pass.
- Frontend typecheck: pass.
- Backend `npx.cmd tsc --noEmit`: pass.
- Frontend `npx.cmd tsc --noEmit`: pass.
- Backend build: pass.
- Frontend build: pass with the existing Vite large chunk warning.
- Frontend full `npm.cmd test`: pass, 6 dev-config tests and 78 source tests passed.
- Backend full `npm.cmd test`: not green in this dirty checkout; timed out after 245s after hitting unrelated citation/generation failures outside Brick 22, including Vitest-suite files executed by Node's test runner and missing citation exports.

Brick 22 current truth:

- `divisionOutputs` now survive Map serialization into metadata/SSE/frontend state.
- `final_answer_ready` is progress/data only; frontend terminal state comes only from explicit backend terminal statuses.
- Backend terminal status is exposed on `ResearchPipelineResult`; frontend `COMPLETE` no longer re-derives source-gap success or warning state.
- Empty/metadata-only final answers fail with `EMPTY_FINAL_ANSWER`.
- Result snapshots keep sources, cited IDs, citation report, source contract, quality gate, source gap report, division outputs, fallback flags, and terminal status together.
- Message rows support structured metadata columns while hidden HTML-comment metadata remains for backward compatibility.
- Failed provider messages include safe visible provider/model/status/stage details.
- Cache entries can be tagged by run/status and failed/partial entries are not reused as success by default.
- Superseded runs abort through the request `AbortController`, persist cancelled state, and write no further terminal/content frames after the guard trips.
- Stale running run records can be recovered as interrupted.

Fresh commands run in this repair pass:

```powershell
node --import tsx --test tests/evidence/claim-ledger.test.ts tests/synthesis/synthesis-orchestrator.test.ts tests/providers/model-plan.test.ts tests/generation/core-answer-generator-model-path.test.ts tests/evidence/evidence-compressor.test.ts
node --import tsx --test tests/pipeline/research-terminal-events.test.ts
npm.cmd run typecheck --prefix backend
npm.cmd test --prefix backend
npm.cmd run build
node --import tsx --test tests/retrieval/source-enrichment-concurrency.test.ts
node --import tsx --test tests/providers/provider-key-extraction.test.ts tests/providers/provider-status-contract-usage.test.ts tests/providers/provider-status-parallel.test.ts
node --import tsx --test tests/retrieval/search-executor.test.ts
node --import tsx --test tests/division-pipeline.test.ts
node --import tsx --test tests/providers/provider-health-policy.test.ts tests/providers/provider-status-health-semantics.test.ts tests/providers/model-list-http-semantics.test.ts tests/providers/provider-model-route-contract.test.ts
node --import tsx --test tests/retrieval/*.test.ts
npm.cmd run typecheck --prefix backend
npm.cmd run build --prefix backend
npm.cmd test --prefix backend
npm.cmd run typecheck --prefix frontend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
npm.cmd run build
```

Latest focused results from the 2026-05-26 ClaimLedger/ModelPlan pass:

- ClaimLedger/synthesis/model-plan/generation/evidence-compressor targeted tests: 14 passed, 0 failed.
- Research terminal event regression: 1 passed, 0 failed.
- Backend typecheck: pass.
- Backend full test suite: 497 tests, 492 passed, 5 live-key-gated skipped, 0 failed.
- Root build: pass. Frontend build still reports the known large chunk warning.

Previous broader results:

- Backend typecheck: pass.
- Targeted security/provider/retrieval/division regression tests: pass.
- Backend full test suite: 377 tests, 372 passed, 5 skipped, 0 failed.
- Backend build: pass.
- Frontend typecheck: pass.
- Frontend test script: 6 dev-config tests passed, 66 TS/TSX source tests passed, 0 failed.
- Frontend build: pass with existing large-chunk warning.
- Root build: pass with existing large-chunk warning.
- Browser/UI visual verification: not rerun in this cleanup pass; prior screenshot remains at `docs/backend-overhaul/frontend-stabilization-visual-check.png`.

## How To Test

Run from `C:\Users\HP\Desktop\BestDel\BestDel-refactor-local`:

```powershell
npm.cmd run typecheck --prefix backend
node --import tsx --test tests/assistant-persistence.test.ts tests/archives.test.ts tests/regression/persistence-integrity-source.test.ts
npm.cmd test --prefix backend
npm.cmd run build --prefix backend
npm.cmd run typecheck --prefix frontend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
npm.cmd run build
node C:\tmp\bestdel-verify-ui.cjs
npm.cmd run smoke:provider-route-semantics --prefix backend
npm.cmd run smoke:core-generation-budget --prefix backend
npm.cmd run smoke:provider-fallback --prefix backend
npm.cmd run smoke:fast-research-local --prefix backend
npm.cmd run smoke:source-usage --prefix backend
npm.cmd run smoke:visible-research-output --prefix backend
npm.cmd run smoke:research-modes --prefix backend
npm.cmd run smoke:division-synthesis --prefix backend
npm.cmd run smoke:retrieval-quality --prefix backend
npm.cmd run smoke:hallucination-guard --prefix backend
```
# Current System Status - 2026-06-01 Functional Pipeline Repair

What works:
- The core research pipeline now uses one normalized query through agenda, dimension, archive routing, query planning, source usage, and generation.
- Mocked end-to-end research can retrieve/preload sources, build stable EvidenceRegistry IDs, create EvidencePacks, validate SourceUsageMap, build ClaimLedger/ClaimGraph, generate a cited answer, run citation repair, run D1-D11 quality gates, persist diagnostics, and emit canonical terminal status.
- Backend terminal status is the source of truth. Frontend run-state tests confirm source gaps and fallback do not become green completed states.
- Source filtering preserves rejection diagnostics in SourceGapReport.
- Enrichment handles invalid URLs, empty extraction text, Firecrawl invalid keys, limited snippet fallback, and provider timeout aborts.
- Citation selection no longer gives credit to unsupported random/authority/hash fallback sources; unsupported paths become citation gaps.

Verification:
- PASS `npm.cmd test --prefix backend`
- PASS `npm.cmd run typecheck --prefix backend`
- PASS `npm.cmd run build --prefix backend`
- PASS `npm.cmd test --prefix frontend`
- PASS `npm.cmd run typecheck --prefix frontend`
- PASS `npm.cmd run build --prefix frontend`
- PASS `npm.cmd run build`
- PASS package-local `npx.cmd tsc -p tsconfig.json --noEmit` from `backend/`
- PASS package-local `npx.cmd tsc -p tsconfig.json --noEmit` from `frontend/`

Known limitations:
- No live provider/search/extraction calls were run in this repair pass.
- Root-level `npx.cmd tsc -p backend/tsconfig.json --noEmit` tries to fetch `tsc` from the registry in this workspace; package-local `npx` and local binaries are green.
- The uploaded census contains additional findings outside the minimum functional pipeline path.
# Retrieval Cache Rebuild Note

The retrieval cache has been restored as an L1 in-memory system behind `RETRIEVAL_CACHE_ENABLED` (default `false`). It reuses `CacheManager` and now covers search results, URL enrichment snapshots and negative extraction entries, Jina/Firecrawl cooldown persistence, normalized source candidates, and evidence-ready cards. The academic cache event/namespace compatibility is present, but this checkout does not currently include an academic runtime folder to wire.
