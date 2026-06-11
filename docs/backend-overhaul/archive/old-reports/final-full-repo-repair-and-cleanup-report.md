# Summary

The real UI research path was hardened around the guarded core pipeline. Fast, Deep, PhD, and FullSpectrum now default to core research semantics, run-scoped event envelopes, no silent legacy fallback, visible provider/source gap failures, bucketed India-democratic-space query planning, and citation/source contract validation.

This was a quarantine-first repair, not a deletion pass. Legacy systems remain present where removal would be risky, but the production research route is guarded so `handleMultiSearch` is not the default path for the research modes.

# Full Repo Audit

Created `docs/backend-overhaul/full-repo-bug-and-clutter-audit.md` and `docs/backend-overhaul/clutter-cleanup-plan.md`.

Classification summary:

- Kept: current core pipeline, bucketed retrieval, evidence registry, source gates, provider router, frontend chat route, source panel, persisted pipeline compatibility.
- Refactored: run-scoped frontend pipeline state, persisted pipeline metadata parser, streaming event filtering, core route provider failure handling, pipeline fallback gating.
- Merged/isolated: legacy lib research/search/provider/citation systems remain compatibility-only and documented as legacy fallback/test paths.
- Archived: stale backend-overhaul completion reports moved under `docs/backend-overhaul/archive/old-reports/`.
- Test-only: deterministic/mock retrieval and synthetic source usage are restricted by tests or explicit fallback controls.
- Legacy fallback only: old web-search/multi-search route behavior is explicitly gated by fallback flags or legacy mode.

# Root Causes

Stale streams happened because frontend state was effectively global: chunks, source registry, and completion statuses could be accepted without proving they belonged to the current assistant message. The previous prompt leaked because event acceptance tolerated missing assistant/conversation identity. Mode wiring was unreliable because explicit UI mode and prompt inference could diverge. The legacy route survived because old role-based multi-search code stayed reachable as a fallback-shaped default. Query planning was weak where role planners produced repeated/generic searches instead of bucketed source obligations. Source usage was not real enough because synthetic registry-derived usage could stand in for live role usage. Citations and the registry mismatched because final answer citations were not always parsed back into the registry as the backend source of truth. Provider 401/failure caused bad fallback because generation failure could fall through to deterministic/mega-prompt behavior. Docs were misleading because old completion reports remained beside current work.

# Files Changed

Frontend run isolation:

- `frontend/src/hooks/use-pipeline-state.ts`: added `PipelineStateByRun`, per-run `PipelineRunState`, active run mapping, run statuses, source contract, source gap, quality gate, citation status, and stale-event accounting support.
- `frontend/src/components/chat/chat-area.tsx`: tightened event acceptance so post-`run_started` events must match active `runId`, `assistantMessageId`, and `conversationId`; added run status handling for failed/cancelled/provider/source-gap/legacy states.
- `frontend/src/components/chat/persisted-pipeline.tsx`: replaced metadata parsing/rendering with run-aware metadata support; old metadata is rendered as legacy/limited only when scoped to the same assistant message.

Backend route migration and streaming:

- `backend/src/services/anthropic-service.ts`: core route now treats missing provider router as a visible provider error and does not silently fall back to deterministic generation.
- `backend/src/core/streaming/run-event-scope.ts`: added reusable run envelope validation and stale-event acceptance helpers.
- `backend/src/core/pipeline/research-pipeline.ts`: generation fallback is now explicit; production core generation errors throw unless fallback is enabled.

Query planning/source gates/source usage/generation/citation sync:

- `backend/src/core/retrieval/query-planner.ts`: top-up policy now respects per-mode source limits instead of hardcoded PhD constants.
- Added behavioral tests across retrieval, route selection, source gates, live retrieval, source usage, model-backed generation, provider routing, and citation registry sync.

Clutter/docs cleanup:

- `docs/backend-overhaul/CURRENT_SYSTEM_STATUS.md`
- `docs/backend-overhaul/clutter-cleanup-plan.md`
- `docs/backend-overhaul/full-repo-bug-and-clutter-audit.md`
- `docs/backend-overhaul/archive/old-reports/README.md`
- Archived stale completion reports under `docs/backend-overhaul/archive/old-reports/`.

Smoke scripts:

- `backend/scripts/smoke-test-stale-stream.ts`
- `backend/scripts/smoke-test-democracy-sources.ts`

# Before / After

Before:

- Mixed legacy/core architecture.
- Stale prompt leakage risk.
- Weak role searches and 13-query FullSpectrum risk.
- 0-cited-source success risk.
- Misleading complete states.
- Duplicate systems and stale completion reports.

After:

- Core research route is the guarded default for real research modes.
- Frontend accepts research events only when run, assistant message, and conversation match.
- FullSpectrum democratic-space planner produces 89 unique queries across 14 buckets in smoke validation.
- Missing live keys produce SourceGapReport expectations rather than fake success.
- Provider misconfiguration emits provider error instead of streaming stale/old output.
- Legacy fallback is visible and explicit.
- Current status and cleanup docs are the repo truth.

# Commands Run

Passed:

```text
npm.cmd run typecheck --prefix backend
npm.cmd test --prefix backend
  tests 172
  pass 167
  fail 0
  skipped 5
npm.cmd run typecheck --prefix frontend
npm.cmd run smoke:stale-stream --prefix backend
  ok: true
  ignoredStaleEventsCount: 1
  promptBContainsPromptAFingerprint: false
npm.cmd run smoke:democracy-sources --prefix backend
  effectiveResearchMode: fullspectrum
  plannedQueries: 89
  uniqueQueries: 89
  duplicateQueryRate: 0
  bucketsCovered: 14
  legacyFallbackUsed: false
```

Blocked in this sandbox:

```text
npm.cmd run build --prefix backend
npm.cmd run build --prefix frontend
npm.cmd run build
```

All three fail at esbuild/Vite resolution before application bundling with:

```text
Cannot read directory "../../../..": Access is denied.
Could not resolve backend/src/index.ts or frontend/vite.config.js
```

TypeScript compilation passes for both backend and frontend, and backend tests/smokes pass. The build failure appears to be the local Windows sandbox/esbuild resolver trying to inspect parent directories, not a TypeScript or app-code failure. The frontend dependency folder is also currently a junction to the sibling `bestdel-organized` dependency tree, which contributes to the Vite/esbuild path issue.

# Manual UI Verification

Not completed in this run. The local build is blocked by the esbuild resolver issue above, and live research verification requires configured search/model API keys. The smoke tests verify the critical stale-stream/run-scope behavior and FullSpectrum query planning contract without live keys.

# Remaining Limitations

- `anthropic-service.ts`, `chat-area.tsx`, and `research-pipeline.tsx` are still large. The repair hardened the real route but did not finish the full decomposition into the smaller facade/component files requested.
- Full live UI verification still needs real search and model keys plus a dev-server run outside the current esbuild sandbox blocker.
- Legacy files are quarantined/documented, not fully deleted. That is intentional until more replacement coverage is added.
- A full literal per-file audit for every one of the roughly 319 files was summarized by grouped classification and route analysis, not expanded into 319 table rows.
- Generated frontend build probe files may remain if the local failed build emitted them; they should be cleaned in a normal repo checkout before commit.
