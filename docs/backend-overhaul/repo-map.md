# BestDel Backend Overhaul Repo Map

Generated from the live checkout at `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed`.

## Package And Entrypoints

- Package manager: npm, with root workspace-style scripts in `package.json`.
- Root scripts: `dev`, `build`, `start`, `install:all`.
- Backend scripts: `backend/package.json` exposes `dev`, `build`, `start`, `typecheck`, `test`.
- Frontend scripts: `frontend/package.json` exposes `dev`, `build`, `preview`, `typecheck`.
- Backend entrypoint: `backend/src/index.ts`.
- Backend route index: `backend/src/routes/index.ts`.
- Active research route: `backend/src/routes/anthropic.ts`, which re-exports `backend/src/services/anthropic-service.ts`.
- Frontend entrypoint: `frontend/src/main.tsx`, app shell under `frontend/src/App.tsx`.

## Backend Route And Service Files

- `backend/src/routes/anthropic.ts`: compatibility route export.
- `backend/src/services/anthropic-service.ts`: live chat/research SSE route, legacy multi-search/deep-research orchestration, and new core-pipeline adapter for deep research.
- `backend/src/routes/archives.ts`: archive CRUD routes and archive prompt context.
- `backend/src/routes/verify.ts`: verification route.
- `backend/src/routes/health.ts`: provider health.

## Existing Research And Retrieval Files

- `backend/src/lib/rag.ts`: existing retrieval augmentation, enrichment, evidence manifests, citation formatting.
- `backend/src/lib/web-search.ts`: web-search execution, fallback/gating, in-flight dedupe.
- `backend/src/lib/dimension-engine.ts`: dimension detection and activated research dimensions.
- `backend/src/lib/division-framework.ts`: eleven-division research output framework.
- `backend/src/lib/evidence-registry.ts`: legacy evidence registry used by old division pipeline.
- `backend/src/lib/quality-gate.ts`: legacy division quality gate and repair logic.
- `backend/src/lib/chat-system-prompt.ts`: system prompt construction and archive context injection.

## New Core Architecture Files

- `backend/src/core/pipeline/research-pipeline.ts`
- `backend/src/core/pipeline/pipeline-state.ts`
- `backend/src/core/pipeline/pipeline-events.ts`
- `backend/src/core/pipeline/pipeline-errors.ts`
- `backend/src/core/pipeline/pipeline-telemetry.ts`
- `backend/src/core/agenda/agenda-contract.ts`
- `backend/src/core/agenda/archive-safety.ts`
- `backend/src/core/retrieval/source-buckets.ts`
- `backend/src/core/retrieval/query-planner.ts`
- `backend/src/core/retrieval/search-executor.ts`
- `backend/src/core/retrieval/bucketed-retrieval.ts`
- `backend/src/core/retrieval/source-deduper.ts`
- `backend/src/core/retrieval/source-filter.ts`
- `backend/src/core/retrieval/source-scoring.ts`
- `backend/src/core/retrieval/source-enrichment.ts`
- `backend/src/core/retrieval/reranker.ts`
- `backend/src/core/retrieval/retrieval-cache.ts`
- `backend/src/core/evidence/evidence-registry.ts`
- `backend/src/core/evidence/evidence-card.ts`
- `backend/src/core/evidence/evidence-pack-builder.ts`
- `backend/src/core/evidence/claim-graph.ts`
- `backend/src/core/evidence/citation-map.ts`
- `backend/src/core/evidence/source-usage-map.ts`
- `backend/src/core/synthesis/model-role-runner.ts`
- `backend/src/core/synthesis/synthesis-orchestrator.ts`
- `backend/src/core/synthesis/thesis-synthesis.ts`
- `backend/src/core/synthesis/division-synthesis.ts`
- `backend/src/core/synthesis/debate-utility-generator.ts`
- `backend/src/core/synthesis/strategic-synthesis.ts`
- `backend/src/core/verification/citation-validator.ts`
- `backend/src/core/verification/hallucination-guard.ts`
- `backend/src/core/verification/legal-claim-validator.ts`
- `backend/src/core/verification/electoral-integrity-guard.ts`
- `backend/src/core/verification/indian-parliament-framing-guard.ts`
- `backend/src/core/verification/thesis-quality-gate.ts`
- `backend/src/core/verification/repair-orchestrator.ts`
- `backend/src/core/providers/provider-router.ts`
- `backend/src/core/providers/groq-provider.ts`
- `backend/src/core/providers/openrouter-provider.ts`
- `backend/src/core/providers/gemini-provider.ts`
- `backend/src/core/providers/provider-types.ts`
- `backend/src/core/providers/provider-errors.ts`
- `backend/src/core/security/secret-redaction.ts`
- `backend/src/core/security/safe-logger.ts`
- `backend/src/core/streaming/sse-events.ts`
- `backend/src/core/streaming/stream-writer.ts`

## Frontend Contracts Touched

- `frontend/src/hooks/use-pipeline-state.ts`: state and reducer support for core pipeline events, source contract status, source gap reports, and quality gate status.
- `frontend/src/components/chat/chat-area.tsx`: SSE dispatch for `corePipelineEvent`, `sourceContract`, `sourceGapReport`, and `coreQualityGate`.
- `frontend/src/components/chat/research-pipeline.tsx`: visible guarded-pipeline status cards.

## Tests

- Existing backend tests live under `backend/tests/*.test.ts`.
- New core tests live under:
  - `backend/tests/agenda`
  - `backend/tests/retrieval`
  - `backend/tests/evidence`
  - `backend/tests/verification`
  - `backend/tests/security`
  - `backend/tests/integration`
- New fixture: `backend/tests/fixtures/india-democracy-sources.json`.

## Environment Files

- `.env.example`
- `backend/.env.example`
- `frontend/.env.example`

Only env examples contain the local placeholder key-like values requested for testing. Source, tests, fixtures, logs, docs, SSE events, and database/archive state must not contain those values.

## Risky Areas

- `backend/src/services/anthropic-service.ts` remains the large compatibility hub. It now emits the core audit pipeline while preserving legacy deep-research output.
- Old and new evidence registries coexist. The new core registry is the citation source of truth for guarded pipeline tests; the legacy registry is preserved for compatibility.
- Live source retrieval remains dependent on external API availability, rate limits, and content extraction variability.
- Frontend progress UI is additive and preserves old event keys.
