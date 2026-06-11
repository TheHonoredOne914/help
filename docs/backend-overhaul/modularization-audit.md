# Modularization Audit

Branch checked before edits: `refactor/modular-files`

Scope: audit files over 300 lines, then perform only Phase 1 frontend chat modularization. Line counts are from this checkout before Phase 1 edits, excluding `node_modules`, build output, and `.git`.

## Large Files Over 300 Lines

| Rank | File | Lines | Current responsibilities | Why too large | Suggested extracted modules | Risk | Tests needed |
|---:|---|---:|---|---|---|---|---|
| 1 | `backend/src/services/anthropic-service.ts` | 4555 | Conversation routes, SSE, research routing, persistence, legacy fallback adapters, title/enhance helpers | High traffic backend entrypoint with mixed route orchestration and response shaping | Route handlers, stream lifecycle, request parsing, persistence adapters, mode dispatch | high | Backend typecheck, route tests, SSE isolation, research-mode smoke |
| 2 | `frontend/src/components/chat/chat-area.tsx` | 2297 | Chat shell, mode controls, provider selection, streaming client, message rendering, metadata handling, welcome UI | One component owns both runtime state and large presentational blocks | Model routing/display helpers, message rendering, metadata helpers, run status rail, input dock, mode controls | medium | Frontend typecheck/build, model routing tests, metadata stripping tests, stale stream guard tests |
| 3 | `frontend/src/components/chat/research-pipeline.tsx` | 1573 | Pipeline state display, source panel integration, model telemetry, status semantics | Many visual subpanels and status mappers live together | Status summary, model cards, source panels, telemetry rows | medium | Frontend typecheck/build, pipeline status semantics tests, visual smoke |
| 4 | `backend/src/lib/web-search.ts` | 1196 | Search providers, fallback behavior, scraping, source normalization | Multiple provider clients and result normalization in one module | Provider clients, result normalizer, timeout/budget helpers | high | Search provider route tests, source classification tests, no-secret logging checks |
| 5 | `backend/src/lib/rag.ts` | 1170 | Retrieval, ranking, chunking, synthesis support | Cross-cutting retrieval and answer-prep logic | Chunking, ranking, retrieval orchestration, prompt context builders | high | Retrieval tests, citation mapping tests, source contract tests |
| 6 | `backend/src/services/division-engine.ts` | 780 | Division generation orchestration and formatting | Mode orchestration mixed with output shaping | Division planner, renderer, validation helpers | medium | Division pipeline tests, word count tests |
| 7 | `backend/src/routes/providers.ts` | 753 | Provider status, key extraction, model list routes, health response shaping | Provider contracts and route handlers are mixed | Key extraction, status normalizer, per-provider route adapters | high | Provider key extraction/status/model list tests |
| 8 | `frontend/src/hooks/use-pipeline-state.ts` | 722 | Pipeline reducer, event semantics, source/citation status state | Reducer and status mapping are tightly coupled | Reducer actions, terminal status semantics, source registry helpers | medium | Existing pipeline status semantics tests, frontend typecheck |
| 9 | `backend/src/core/pipeline/research-pipeline.ts` | 681 | Core research orchestration, retrieval, evidence, SourceUsageMap, citations, quality gate | Critical pipeline stages are concentrated in one file | Stage runners and result finalizer only after strong tests | high | Core research smoke, source usage validation, citation and final status tests |
| 10 | `frontend/src/components/ui/sidebar.tsx` | 673 | Generic sidebar primitives | UI primitive family in one file | Primitive subcomponents if needed | low | Frontend typecheck/build |
| 11 | `frontend/src/components/chat/sidebar.tsx` | 654 | Conversation/archive sidebar, navigation, archive controls | Data actions and presentation are mixed | Archive list, conversation list, action menu | medium | Frontend typecheck/build, sidebar smoke |
| 12 | `frontend/src/hooks/use-provider-models.tsx` | 554 | Provider model fetching, status normalization, cache refresh events | Hook owns network, normalization, and state repair | Fetch client, status mapper, repair helpers | medium | Provider model hook tests, model refresh smoke |
| 13 | `backend/src/core/synthesis/model-role-runner.ts` | 548 | Model role prompting, source usage roles, retries | Provider execution and role validation are coupled | Role prompt builders, retry policy, response parser | high | SourceUsageMap role tests, provider routing tests |
| 14 | `backend/src/core/generation/core-answer-generator.ts` | 495 | Core answer prompt assembly and provider generation | Prompt selection, budget handling, provider calls together | Prompt builder, provider call adapter, citation repair trigger | high | Core answer generator tests, prompt budget tests |
| 15 | `backend/src/db.ts` | 441 | SQLite setup, schema, persistence helpers | Schema and persistence operations share one file | Schema definitions and repository functions | medium | DB tests, persistence integrity tests |
| 16 | `frontend/src/components/chat/settings-dialog.tsx` | 419 | Provider keys, model refresh, settings UI, prompt settings | Secret form and prompt UI share component | Provider key panel, prompt panel, save event helper | medium | Provider refresh tests, frontend typecheck |
| 17 | `backend/src/lib/evidence-registry.ts` | 361 | Evidence registry, citation state, source tracking | Registry model and utilities together | Registry class, citation helpers | high | Evidence registry/citation sync tests |
| 18 | `backend/tests/evidence/source-usage-live-failure-policy.test.ts` | 349 | Live-path source usage failure policy tests | Long test fixture and assertions | Fixtures/helper builders | low | Existing backend test command |
| 19 | `backend/src/routes/archives.ts` | 339 | Archive CRUD, merge, chat context | Archive routes and safety checks mixed | Route handlers, merge safety adapter | medium | Archive tests, archive merge safety tests |
| 20 | `backend/src/lib/verify.ts` | 333 | Verification helpers and provider checks | Verification logic mixed with route-adjacent helpers | Claim verifier, citation verifier | medium | Verification tests |
| 21 | `frontend/src/components/ui/chart.tsx` | 332 | Chart primitives and tooltip wrappers | Generic primitive collection | Leave unless chart surface grows | low | Frontend typecheck/build |
| 22 | `backend/src/lib/division-framework.ts` | 322 | Division framework types and helpers | Static framework and helpers together | Types/constants split only if reused widely | low | Division framework tests |

## Safest Refactor Order

1. `frontend/src/components/chat/chat-area.tsx` presentational and pure-helper extraction only.
2. `frontend/src/hooks/use-provider-models.tsx` pure normalization helpers after preserving provider refresh tests.
3. `frontend/src/components/chat/research-pipeline.tsx` display subcomponents after status tests.
4. `frontend/src/components/chat/sidebar.tsx` archive/conversation presentational split.
5. `backend/src/routes/providers.ts` route/helper split with provider contract tests.
6. `backend/src/services/anthropic-service.ts` route orchestration split only after targeted SSE and research route coverage.
7. `backend/src/core/pipeline/research-pipeline.ts` and `backend/src/core/generation/core-answer-generator.ts` last; they are core runtime files and should not be split in Phase 1.

## Phase 1 Decision

Proceed only with `frontend/src/components/chat/chat-area.tsx`. Do not refactor backend provider, source usage, citation, archive, or research pipeline code in this pass.
