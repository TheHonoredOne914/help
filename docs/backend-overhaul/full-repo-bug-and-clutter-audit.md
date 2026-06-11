# Full Repo Bug And Clutter Audit

Date: 2026-05-17

## Method

Audit used actual file inventory, route searches, and import/runtime flow inspection. The repo is not a Git checkout and dependencies were initially missing, so this audit is source-grounded plus targeted verification where possible.

## Classification Summary

| Status | Count/Scope | Meaning |
| --- | --- | --- |
| KEEP | app entrypoints, DB/schema, archive routes, core research modules, current UI shell, UI primitives | Active code needed by real app. |
| REFACTOR | `anthropic-service.ts`, `chat-area.tsx`, `research-pipeline.tsx`, `use-pipeline-state.ts` | Used by real route but too large or stateful. |
| MERGE | duplicate core/lib research systems | Core owns production; useful legacy behavior should migrate into core. |
| DELETE | none yet | Delete only after imports and replacement tests prove unused. |
| ARCHIVE_DOC | historical completion/plan reports | Moved to `archive/old-reports`. |
| TEST_ONLY | deterministic search/generation, fixture pipelines, synthetic SourceUsageMap | Allowed only in tests or explicit deterministic mode. |
| LEGACY_FALLBACK_ONLY | old RAG/web-search/multi-search/division path | Explicit flags/mode only, never default PhD/FullSpectrum. |

## File Classification Table

| File | Role | Status | Problem | Action |
| --- | --- | --- | --- | --- |
| `backend/src/app.ts`, `index.ts`, `routes/index.ts` | Server entrypoints | KEEP | None central to overhaul | Keep. |
| `backend/src/routes/anthropic.ts` | Chat/research route export | KEEP | Delegates to large service | Keep facade. |
| `backend/src/services/anthropic-service.ts` | Real UI route hub | REFACTOR | Huge; still contains core and legacy paths | Keep core default, isolate legacy, continue extraction. |
| `backend/src/services/anthropic/*` | Route adapters | KEEP/REFACTOR | Partial decomposition only | Add run/provider/message/metadata adapters over time. |
| `backend/src/core/pipeline/research-pipeline.ts` | Core pipeline | KEEP | Previously allowed silent fallback | Core production path; fallback explicit only. |
| `backend/src/core/retrieval/query-planner.ts` | Bucketed planner | KEEP | Needed mode top-up policy alignment | Production planner for all research modes. |
| `backend/src/core/retrieval/search-executor.ts` | Live/mock search executor | KEEP | Deterministic path must be test-only | Keep mock disabled for live production route. |
| `backend/src/core/retrieval/bucketed-retrieval.ts` | Retrieval, top-up, gaps | KEEP | SourceGapReport must remain visible | Keep and test. |
| `backend/src/core/retrieval/source-buckets.ts` | Bucket definitions | KEEP | Democratic-space coverage is central | Keep. |
| `backend/src/core/evidence/*` | EvidenceRegistry, EvidencePacks, SourceUsageMap | KEEP | Synthetic usage must be test-only | Production citation/source truth. |
| `backend/src/core/generation/*` | Core answer generator/prompt | KEEP/TEST_ONLY | Template path must not be silent production success | Model path for production; deterministic only test/explicit. |
| `backend/src/core/verification/*` | Citation/quality/legal/framing guards | KEEP | Needs behavior tests | Keep. |
| `backend/src/core/providers/*` | Core provider router/adapters | KEEP | Provider errors must be visible | Production generation path. |
| `backend/src/core/streaming/*` | SSE/run scope helpers | KEEP | Run-scoped event acceptance needed | Keep. |
| `backend/src/lib/web-search.ts`, `rag.ts`, `query-planner.ts` | Legacy search/RAG/planning | LEGACY_FALLBACK_ONLY | Duplicates core and can produce weak role searches | Keep behind explicit legacy flags. |
| `backend/src/lib/evidence-registry.ts`, `quality-gate.ts`, `provider-router.ts`, `hallucination-guard.ts` | Legacy evidence/provider/quality | LEGACY_FALLBACK_ONLY/MERGE | Duplicates core contracts | Migrate useful behavior to core, do not use default research route. |
| `backend/src/services/division-engine.ts`, `lib/division-framework.ts` | Legacy/full division engine | LEGACY_FALLBACK_ONLY/MERGE | Large old path | Keep only for explicit fallback until core D1-D11 fully replaces. |
| `backend/src/routes/archives.ts`, `health.ts`, `providers.ts` | Supporting API routes | KEEP | None central | Keep. |
| `backend/src/routes/messages.ts` | Old/simple message route | REFACTOR | Narrow old mode schema | Keep if imported; align schema if route becomes active. |
| `backend/tests/**` | Test suite | KEEP/REFACTOR | Some static tests shallow | Add behavior tests; retire misleading static-only checks later. |
| `backend/scripts/smoke-test-*.ts` | Smoke scripts | KEEP/REFACTOR | Were synthetic/planner-only | Upgraded to print run/source contract facts. |
| `frontend/src/components/chat/chat-area.tsx` | Real chat UI and streaming | REFACTOR | Huge, held global stream assumptions | Make run-scoped now; split later. |
| `frontend/src/hooks/use-pipeline-state.ts` | Pipeline reducer | REFACTOR | Global state risk | Store per-run state and derive active compatibility fields. |
| `frontend/src/components/chat/research-pipeline.tsx` | Live pipeline panel | REFACTOR | Large, can show old legacy states | Keep but make statuses honest. |
| `frontend/src/components/chat/persisted-pipeline.tsx` | Saved pipeline renderer | REFACTOR | Old metadata weak | Run-scoped metadata and legacy-limited rendering. |
| `frontend/src/components/chat/chat-input.tsx` | Mode/composer component | KEEP | Already exposes four research modes | Keep. |
| `frontend/src/components/chat/source-panel.tsx` | Source display | REFACTOR | Regex citation extraction is fallback only | Prefer backend citation status where available. |
| `frontend/src/components/chat/sidebar.tsx`, `top-header.tsx`, `settings-dialog.tsx`, `health-bar.tsx`, UI primitives | UI shell/settings | KEEP | Not central to route correctness | Keep. |
| `frontend/src/lib/api-client.ts`, `api-fetch.ts` | API client/BYOK headers | KEEP | Ensure researchMode payload uses stream caller | Keep. |
| `frontend/src/pages/chat.tsx` | Archive/chat shell | KEEP | Archive dialog already controlled | Keep. |
| `docs/backend-overhaul/archive/old-reports/*` | Historical reports | ARCHIVE_DOC | Could mislead as current truth | Archived. |
| `docs/backend-overhaul/CURRENT_SYSTEM_STATUS.md` | Current truth | KEEP | New | Maintain after future changes. |
| `README.md`, `SETUP_ON_NEW_LAPTOP.md`, `AGENTS.md`, `migration-context/*` | Setup/context | KEEP/ARCHIVE_DOC | Some historical claims may age | Keep, update when packaging again. |

## Root Bugs Confirmed

- Stale streams were possible because frontend state had global active output fields and accepted events when assistant identity was missing.
- Legacy route survived because `handleMultiSearch` still sat in the same route hub and only the core gate prevented it.
- Provider configuration errors could continue into deterministic generation.
- Persisted metadata did not strongly bind to assistant messages.
- Some tests verified source text instead of behavior.

