# Clutter Cleanup Diagnosis

Date: 2026-05-18

## Classification

| Area | Current files | Classification | Action |
| --- | --- | --- | --- |
| Research pipeline | `backend/src/core/pipeline/*` | production_core | Deep/PhD/Full/Fast research should route here. |
| Evidence registry | `backend/src/core/evidence/evidence-registry.ts` | production_core | Source contract, SourceUsageMap, citation sync use this registry. |
| Legacy evidence registry | `backend/src/lib/evidence-registry.ts` | legacy_fallback_only | Keep only while old route/tests exist; do not use for core research. |
| Query planner | `backend/src/core/retrieval/query-planner.ts` | production_core | Core bucketed retrieval source plan. |
| Legacy query planner | `backend/src/lib/query-planner.ts` | legacy_fallback_only | Keep for old multi-search fallback only. |
| Provider router | `backend/src/core/providers/provider-router.ts` | production_core | Core model-backed generation/source-usage route. |
| Legacy provider router | `backend/src/lib/provider-router.ts` | legacy_fallback_only | Keep for non-core/legacy utilities until migrated. |
| Hallucination guard | `backend/src/core/verification/hallucination-guard.ts` | production_core | Core final validation. |
| Legacy hallucination guard | `backend/src/lib/hallucination-guard.ts` | duplicate_to_merge | Same concern as core guard; merge later after route tests cover legacy callers. |
| Thesis quality gate | `backend/src/core/verification/thesis-quality-gate.ts` | production_core | Core final answer gate. |
| Legacy quality gate | `backend/src/lib/quality-gate.ts` | legacy_fallback_only | Keep for old route until deleted. |
| Old multi-search route | `backend/src/services/anthropic-service.ts` / legacy branch | legacy_fallback_only | Disabled unless `USE_LEGACY_RESEARCH_ROUTE=true`. |
| Frontend old batch roles | `frontend/src/components/chat/research-pipeline.tsx` | duplicate_to_merge | UI still displays legacy role labels for legacy events; core events are now the research source of truth. |

## Cleanup Already Done

- Older completion reports were moved to `docs/backend-overhaul/archive/old-reports/`.
- Current truth is now `docs/backend-overhaul/CURRENT_SYSTEM_STATUS.md`.
- `backend/data/*.db` is ignored; source packages should include only `backend/data/.gitkeep`.

## Remaining Safe Cleanup

- Split `anthropic-service.ts` into route orchestration, SSE event mapping, and legacy fallback modules.
- Split `chat-area.tsx` into model/provider state, SSE stream handling, and composer UI.
- Split `research-pipeline.tsx` into core status, legacy status, source panel, and answer renderer.
- Retire `backend/src/lib/*` only after normal/rhetorics and explicit legacy tests are migrated.
