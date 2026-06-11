# BestDel Real UI Route Diagnosis

Date: 2026-05-19

## Reproduction Status

`npm run dev` was started from `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed`. Vite reported port `5173` was already in use and started the frontend on `http://localhost:5174/`. Backend startup output did not produce a ready line during the initial trace window, so this diagnosis is grounded in the live route source, frontend request code, and current SSE plumbing. Manual Prompt A/Prompt B browser verification is listed in the final report checklist and must be repeated after the patch.

## Code-Grounded Findings

1. Frontend request payload for Prompt A and Prompt B currently comes from `frontend/src/components/chat/chat-area.tsx` inside `runStream()`. The request body includes `content`, `mode`, `modelConfig`, `normalModel`, `webModels`, and `systemPrompt`.
2. `researchMode` is not included in the current request body.
3. The frontend mode type is `type ChatMode = "normal" | "web_search" | "deep_research"`, so PhD and FullSpectrum are not selectable in the real chat route.
4. `runId` does not exist before streaming in the frontend request.
5. `assistantMessageId` does not exist before streaming in the frontend request.
6. The backend route used by the UI is `POST /api/anthropic/conversations/:id/messages` in `backend/src/services/anthropic-service.ts`.
7. The backend request schema accepts only `mode: "normal" | "web_search" | "deep_research" | "rhetorics"` and does not validate `researchMode`.
8. The backend creates the user message before streaming, but it does not create an assistant placeholder before research starts.
9. The backend has no run identity envelope in the route. Existing events are sent as plain SSE JSON payloads.
10. `handleMultiSearch()` still runs for `(mode === "web_search" || mode === "deep_research") && effectiveWebModelsMin2.length > 1`.
11. `runResearchPipeline()` is invoked from inside `handleMultiSearch()` only after legacy searches have produced `allEnrichedResults`.
12. That core invocation passes `preloadedSources: allEnrichedResults.map(enrichedResultToCoreSource)`, so the real route still depends on legacy role search rather than live bucketed retrieval.
13. The core bucketed query planner exists under `backend/src/core/retrieval/query-planner.ts`, but the real UI route does not use it as the default entrypoint for deep research.
14. The legacy role query planner still owns the user-facing deep path through `handleMultiSearch()`, which explains tiny role counts such as 1-2 searches per role.
15. Source registry state is built inside the legacy multi-search path before core pipeline adaptation, so registry scope depends on the legacy route's accumulated `allEnrichedResults`.
16. Final answer selection can use core output only after legacy preloading. Legacy synthesis and fallback remain possible without a run-scoped visible contract.
17. Frontend pipeline state is global to the chat component reducer. `usePipelineState()` stores one `corePipelineEvents`, `sourceContract`, `sourceGapReport`, `coreQualityGate`, and `selectedResearchMode` set.
18. The frontend uses a single `abortControllerRef`, not an `AbortController` keyed by `runId`.
19. Incoming SSE events are dispatched directly into the global pipeline reducer; there is no guard comparing `runId`, `assistantMessageId`, and `conversationId`.
20. Persisted pipeline metadata is embedded as `<!--BESTDEL_PIPELINE:{...}-->` with `mode`, `models`, `discussion`, and `sources`, but no `runId`, `requestId`, `assistantMessageId`, `queryHash`, source contract, citation status, or quality gate.
21. The Evidence Registry UI can drift from the final answer because the frontend still depends partly on streamed/persisted source lists and text parsing rather than a backend run-scoped citation status.
22. The UI can show misleading completion because terminal success is based on stream completion/pipeline phase, not a hard source contract requiring cited sources, role findings, bucket coverage, and quality gate pass.
23. PhD/FullSpectrum source counts are not enforced in the real UI route because those modes are not exposed in the request and the default route is still legacy `deep_research`.

## Root Cause

The new core pipeline exists, but the real UI route is still shaped by the legacy Normal/Web/Deep mode contract. Deep research enters `handleMultiSearch()`, performs role-based search, then optionally adapts legacy results into `runResearchPipeline(preloadedSources)`. Because events and persisted metadata are not run-scoped, Prompt A events and metadata can update the visible state for Prompt B.

## Required Repair Direction

The real route must create a run identity and assistant placeholder before streaming, send that identity in every SSE event, make frontend state keyed by `runId` and `assistantMessageId`, and route Fast/Deep/PhD/FullSpectrum directly into `runResearchPipeline(liveRetrieval: true, allowMockRetrieval: false)`. Legacy `handleMultiSearch()` must be explicit fallback only.
