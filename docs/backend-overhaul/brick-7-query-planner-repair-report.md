# Brick 7 Query Planner Repair Report

Date: 2026-05-28

## Brick
- Number: 7
- Name: Query Planner
- Primary for this patch: yes
- Secondary bricks implicated: agenda topic classification, retrieval top-up integration, legacy planner adapters

## Code Path
- Frontend entry: research mode payloads continue to reach the backend unchanged.
- Backend route: `backend/src/services/anthropic-service.ts` routes research into `runResearchPipeline()`.
- Pipeline entry function(s): `backend/src/core/pipeline/research-pipeline.ts` builds the `AgendaContract`, selects the retrieval critic model assignment when available, and calls `buildBucketedQueryPlanWithExpansion()`.
- Key helpers/validators: `backend/src/core/retrieval/query-planning/*`, `backend/src/core/retrieval/source-buckets.ts`, legacy adapters in `backend/src/lib/query-planner.ts`, `backend/src/services/research-planner.ts`, and `backend/src/lib/web-search.ts`.

## Current Behavior
- Expected: Brick 7 generates topic-specific, role-aware, bucket-aware, freshness-aware, Indian parliamentary queries with telemetry and no archive contamination.
- Actual before fix: the core planner was a single static file, generic Indian prompts collapsed to shallow buckets, keyword extraction could fall back to `accountability`, food security could classify as security policy, top-up strings mixed bucket labels into queries, and legacy planners could still generate unrelated NCRB/CAG/MEA/Freedom House fallback sets.

## Failure Points
- Static-only generation underused agenda entities, mode, source buckets, and role lenses.
- The initial modular pass differentiated modes by limits and optional builders, but not enough by query text; fast, deep, PhD, and FullSpectrum needed distinct language families.
- Archive topic was concatenated into legacy search subjects before relevance checks.
- Drift filtering checked templates before final `{agenda}` substitution.
- Deduplication was split across legacy helpers and did not preserve domain-targeted diversity.
- Query decisions had no structured telemetry for generated, rejected, or deduped queries.

## Fix
- Added modular `backend/src/core/retrieval/query-planning/` files for types, keywords, classifier, bucket selection, template resolution, mode strategy, optional LLM expansion, fallback/top-up/freshness/parliamentary builders, archive guard, drift filter, dedupe, telemetry, validator, and index exports.
- Kept `backend/src/core/retrieval/query-planner.ts` as a thin compatibility re-export for existing imports.
- Added `buildBucketedQueryPlanWithExpansion()` with provider-backed JSON expansion only when an eligible retrieval critic provider exists; invalid or unavailable LLM output falls back deterministically.
- Added explicit mode-specific query text generation: fast overview/high-confidence queries, deep recent-development and key-argument angle queries, PhD scholarly/statistical/trend queries, and FullSpectrum timeline/counterargument/comparative/implementation-gap queries.
- Expanded Indian topic classification and generic bucket coverage while keeping existing bucket IDs.
- Routed legacy query minimums and web-search engineered queries through the official planner adapters.
- Moved top-up query construction to clean search-engine patterns and reused it from bucketed retrieval.

## Tests
- Added modular tests under `backend/tests/retrieval/query-planning/`.
- Updated behavior covered: no `accountability` fallback, broad generic bucket coverage, food/water security classification, mode-specific query text families, archive isolation, clean top-ups, topic-aware fallbacks, freshness, parliamentary targeting, acronym-preserving dedupe, resolved drift rejection, query telemetry, LLM schema fallback, and legacy adapter routing.
- Existing query-planner regression tests continue to cover democratic-space 14-bucket/80-query behavior and backward-compatible exports.

## Verification
- PASS: `node --import tsx --test tests/retrieval/query-planning/mode-query-strategy.test.ts`
- PASS: `node --import tsx --test tests/retrieval/query-planning/*.test.ts`
- PASS: `node --import tsx --test tests/retrieval/query-planner.test.ts tests/retrieval/query-planner-quality-regression.test.ts tests/retrieval/query-planner-fullspectrum-real.test.ts`
- PASS: `node --import tsx --test tests/pipeline-validation-helpers.test.ts tests/integration/core-route-replaces-legacy.test.ts`
- PASS: `npx.cmd tsc -p tsconfig.json --noEmit` from `backend/`
- NOTE: `npx.cmd tsc -p backend/tsconfig.json --noEmit` from repo root attempted registry resolution for `tsc` before checking code in this workspace; the backend-local command used installed TypeScript.

## Remaining Risks
- Live LLM query expansion depends on provider availability and quality; invalid schemas are rejected and deterministic fallback is verified.
- Legacy `handleMultiSearch` still exists for explicit fallback routes, but its query minimums now use official planner output.
- Full live retrieval quality still depends on search provider availability and belongs to Brick 8 execution, not this Brick 7 patch.
