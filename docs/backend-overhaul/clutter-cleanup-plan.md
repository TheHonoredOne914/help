# Clutter Cleanup Plan

## Cleanup Strategy

Use quarantine-first cleanup. Do not delete code just because a newer core equivalent exists. Production research routes must use core modules; legacy modules can remain only as explicit fallback, compatibility, or test support.

## Clutter Groups

| Group | Examples | Decision | Action |
| --- | --- | --- | --- |
| Duplicate backend evidence systems | `core/evidence/*`, `lib/evidence-registry.ts` | Merge over time | Core is production source of truth; legacy remains compatibility only. |
| Duplicate query planners | `core/retrieval/query-planner.ts`, `lib/query-planner.ts`, role planner code in route | Quarantine legacy | Fast/Deep/PhD/FullSpectrum use core bucket planner only. |
| Duplicate provider routing | `core/providers/*`, `lib/provider-router.ts`, direct client helpers | Merge over time | Core provider router owns model-backed core generation; direct clients remain normal/chat compatibility. |
| Old RAG/web search paths | `lib/rag.ts`, `lib/web-search.ts`, `handleMultiSearch` | Legacy fallback only | Accessible only through explicit legacy flags/mode. |
| Frontend global pipeline state | `use-pipeline-state.ts`, old `streamingContent` assumptions | Refactor | Store per-run state and expose active-run compatibility fields. |
| Old metadata format | `BESTDEL_PIPELINE` without run identity | Merge | New metadata is run-scoped; old metadata renders as legacy/limited only. |
| Stale reports | historical backend-overhaul reports | Archive docs | Moved to `archive/old-reports`. |
| Static/string-only tests | source text checks | Replace/supplement | Add behavior tests for run identity, source gates, search, provider routing, and citation sync. |

## Execution Stages

1. Archive stale docs and add `CURRENT_SYSTEM_STATUS.md`.
2. Force production research route through core by default.
3. Keep `handleMultiSearch` behind explicit legacy route flags.
4. Disable synthetic source usage in live mode unless tests explicitly opt in.
5. Replace misleading completion states with failed/source-gap/provider-error statuses.
6. Add behavior tests and smoke scripts that exercise run identity and source contracts.
7. Delete legacy files only after imports and replacement tests prove they are unused.

