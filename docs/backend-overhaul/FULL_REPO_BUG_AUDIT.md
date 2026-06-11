# Full Repo Bug Audit

## 2026-06-08 Archive Supabase Storage Repair

Problem: archive list/create calls returned 500 because Supabase reported `PGRST205`, meaning `public.archives` was not present in the exposed schema cache. Conversation listing also returned 500 because `backend/src/services/anthropic-service.ts` still referenced a removed Drizzle `db` variable.

Root cause: the checkout had partially migrated persistence to Supabase in `backend/src/db.ts`, but archive/conversation runtime routes still contained old Drizzle query calls and there was no checked-in archive/chat Supabase schema setup script.

Files changed:
- `backend/src/db.ts`
- `backend/src/routes/archives.ts`
- `backend/src/services/anthropic-service.ts`
- `backend/tests/db.test.ts`
- `backend/tests/archives.test.ts`
- `backend/scripts/setup-supabase-archives.sql`
- `docs/backend-overhaul/CURRENT_SYSTEM_STATUS.md`
- `docs/backend-overhaul/FULL_REPO_BUG_AUDIT.md`

Fix: added Supabase table setup SQL for `archives`, `conversations`, `messages`, archive context, research angles, and intelligence profiles with RLS enabled; added Supabase helper functions and explicit snake_case-to-camelCase API mappers; replaced broken Drizzle calls in archive/conversation/message paths with the Supabase helpers; updated route tests and DB contract tests.

Runtime reasoning: `GET/POST /api/archives` now uses a concrete Supabase schema contract and returns the camelCase shape consumed by the frontend. `GET/POST /api/anthropic/conversations` and `POST /api/anthropic/conversations/:id/messages` no longer touch undefined `db`; they read/write the same Supabase tables used by archive creation.

Verification:
- `npm.cmd run typecheck --prefix backend`
- `node --import tsx --test tests\db.test.ts tests\archives.test.ts` from `backend`
- `npm.cmd run build --prefix backend`

Remaining risk: the SQL was not applied from this environment because no Supabase SQL MCP tool, Supabase CLI, or `psql` binary is available. The configured Supabase project still needs `backend/scripts/setup-supabase-archives.sql` run once to clear the live `PGRST205` error.

## 2026-06-01 Functional Pipeline Repair Update

Scope: targeted implementation of the minimum end-to-end research pipeline path from `BESTDEL_FULL_BUG_CENSUS.md`.

Runtime path verified:

| Path | Classification | Runtime usage | Bugs fixed | Risk | Action taken |
| --- | --- | --- | --- | --- | --- |
| `backend/src/core/pipeline/research-pipeline.ts` | production_core, research_pipeline | Normalizes request, builds agenda/query/retrieval/source-usage/generation/final metadata | query drift, missing filter diagnostics, source-usage role overlap, terminal status split | Critical | One normalized query value; filter reasons into SourceGapReport; deterministic role rotation; backend terminal decision as source of truth. |
| `backend/src/services/research-planner.ts` | research_pipeline, legacy_adapter | Legacy query fallback and compatibility planning | discarded topic classification, stale-topic bleed, short acronym filtering | High | Topic-specific fallback seeds; no `void topic`; preserved Indian acronyms. |
| `backend/src/core/evidence/evidence-registry.ts` | research_pipeline | Source identity and citation registry | unstable IDs after filtering/removal | Critical | Monotonic `nextSourceId` and duplicate ID guard. |
| `backend/src/core/retrieval/source-filter.ts` | research_pipeline | Agenda relevance and source rejection | dropped rejection reasons, malformed URL crash risk, false India relevance | High | `withReasons` path; invalid URL rejection; stricter India relevance. |
| `backend/src/core/retrieval/enrichment/*` | research_pipeline, provider_runtime | Extraction, fallback, cache, source quality | malformed URL, empty text, invalid Firecrawl key, weak snippet promotion, timeout residue | High | Canonical/cache URL preservation; empty text fallback; run-disabled invalid Firecrawl; limited snippet fallback; abort-aware provider requests. |
| `backend/src/core/providers/*` | provider_runtime | Generation provider calls | provider timeout zombie work, invalid config classification | High | `ProviderRequest.signal`, timeout abort controller, safe config error code. |
| `backend/src/core/evidence/source-usage/*` | research_pipeline | Strict SourceUsageMap validation and deterministic extraction | over-strict small role bucket checks, acronym grounding rejection, raw full text in prompt path | High | Bucket coverage only for 20+ source strict roles; uppercase acronym grounding; deterministic usage prefers key facts before full text. |
| `backend/src/core/citations/injection/*` | research_pipeline | Citation selection for sections/divisions | random/authority/hash fallback credited unsupported sources | Critical | ClaimLedger/ClaimGraph-supported selection only; explicit `citation_gap`. |
| `backend/src/core/generation/core-answer-generator.ts` | production_core, research_pipeline | Final answer, repair, quality gate, persistence metadata | hard fail on low citation count, missing ledger/graph, stale candidates | Critical | Evidence-only citation repair before fallback; effective ClaimLedger/ClaimGraph; safer provider candidates; final snapshot diagnostics. |
| `backend/src/core/quality-gate/*` | research_pipeline | D1-D11 and final quality | D7/D11 template pass, source-gap bypass | High | D7/D11 evidence-specific checks and source-gap quality enforcement. |
| `backend/src/core/run-state/*` | backend_runtime, frontend_contract | Terminal status contract | degraded fallback shown as normal success; empty final answer success risk | Critical | Canonical statuses only; empty answer fails; frontend does not override backend terminal status. |
| `frontend/src/lib/run-state/*` | frontend_runtime | Run reducer and terminal event semantics | frontend re-derived terminal success | High | Backend terminal status is source of truth; `final_answer_ready` is data, not terminal. |

Implementation note:
- The repair does not claim to close the entire 485-finding census. It closes the pipeline-breaking source-to-claim-to-citation/status path and adds deterministic mocked tests for the covered contracts.
- Broad verification on 2026-06-01: backend tests/typecheck/build, frontend tests/typecheck/build, root build, and package-local `npx tsc --noEmit` passed.

Remaining risk:
- Live provider credentials were not used.
- Additional non-blocking census findings remain for later batches.
- Root-level `npx.cmd tsc -p backend/tsconfig.json --noEmit` tries to fetch the root `tsc` package; package-local `npx` and local TypeScript binaries pass.

Date: 2026-05-25

Scope: current `bestdel_fixed` source tree, with emphasis on provider/model truth, research pipeline honesty, source usage, citations, retrieval, frontend terminal status, smoke scripts, and archive safety.

## Runtime Paths

| Path | Frontend payload | Backend route / module | Runtime status | Action taken |
| --- | --- | --- | --- | --- |
| Normal mode | `normalModel` only | `anthropic-service` normal path | Provider dependent | Partial stream errors now persist explicit failure records, not truncated answers. |
| Rhetorics mode | selected normal model | rhetorics streaming path | Provider dependent | Existing stream persistence test still passes. |
| Web / Fast Research | `webModels` from `webSearchModels` | core research pipeline | Local policy verified | Fixed fast mode so it no longer uses deep model set. |
| Deep Research | `webModels` from `deepResearchModels` | core research pipeline | Local deterministic verified | Deep democratic-space target remains 20. |
| PhD Research | strict source policy | core research pipeline | Local tests verified | Strict source/citation gates preserved. |
| FullSpectrum | strict source policy | core research pipeline | Local smoke verified | 30-source aggregate proof verified by smoke. |
| Archive creation/deletion | archive payload | archive routes | Tests pass | Delete invariant checks now run inside one atomic store operation. |
| Archive chat | archive context marker | context router | Tests pass | Unsafe archive merge remains blocked. |
| Prompt enhancement | model dependent | backend provider router | Not live-key verified | Provider health remains honest. |
| Title generation | model dependent | backend provider router | Not live-key verified | Key safety and provider errors remain redacted. |
| Source panel rendering | pipeline metadata | frontend pipeline state | Typechecked | Citation status fields extended. |
| Citation rendering | `citationStatus` | citation validator | Tests pass | Regex-only success avoided; fake/bare citations fail. |
| Provider settings save | key headers | provider model routes | Tests pass | Status semantics use HTTP 200 for expected provider states. |
| Model list refresh | provider model routes | `/api/*/models` | Tests pass | Catalog fallback is display-only, not healthy. |
| Research streaming | run-scoped events | stream scope / pipeline events | Tests pass | Legacy/core routes now update the placeholder terminal record instead of inserting duplicates. |
| Failed research state | terminal metadata | final status + frontend state | Tests pass | `provider_error` and `failed` are not success. |
| Source gaps state | terminal metadata | source contract | Smoke pass | Source gaps show warning and cannot auto-merge. |
| Legacy fallback state | terminal metadata | final status | Tests pass | Legacy fallback persists as `legacy_fallback_used` and is blocked from archive merge. |
| Provider error state | safe provider error | provider errors / final status | Tests pass | Raw provider body remains hidden. |

## Important File Classification

| File | Classification | Purpose | Runtime usage / consumers | Known bugs found | Risk | Action taken |
| --- | --- | --- | --- | --- | --- | --- |
| `backend/src/services/anthropic-service.ts` | production_core, backend_runtime, research_pipeline | Main chat/research service route | API chat/research requests | Partial normal streams could be saved, legacy research could duplicate assistant rows, exhausted branches could leave placeholders unfinished, fallback output could merge into archive memory | Critical | Routed terminal writes through persistence helpers; failed/exhausted/fallback paths now persist explicit terminal metadata and do not archive-merge. |
| `backend/src/services/assistant-persistence.ts` | production_core, backend_runtime | Shared assistant persistence and archive-merge guard | chat/research service route | File missing; assistant persistence decisions were scattered | High | Added update-vs-insert helper, explicit failure helper, and strict archive merge wrapper. |
| `backend/src/routes/archives.ts` | backend_runtime | Archive CRUD routes and invariants | archive sidebar/workspace routes | Delete checked archive count and linked conversations outside the delete operation | High | Replaced separate count/delete calls with atomic `deleteArchiveIfSafe` transaction outcome. |
| `backend/src/routes/providers.ts` | provider_runtime | Provider model/status routes | frontend model hook, settings refresh | Catalog fallback and Gemini source semantics could lie; cache used weak hash; status timeout was only test-injectable; normal `GET /providers/status` refreshes returned health JSON without emitting provider diagnostic logs | High | Fixed status payload source, SHA-256 key fingerprints, `PROVIDER_STATUS_TIMEOUT_MS` runtime timeout configuration, and configured-provider diagnostic logging on the real refresh path. |
| `backend/src/core/providers/provider-key-extraction.ts` | provider_runtime | Canonical request/env key extraction | provider routes, provider router | Ollama env fallback was missing from canonical extraction | High | Added `OLLAMA_API_KEY` and `OLLAMA_BASE_URL` env fallback so routes consume one key contract. |
| `backend/src/core/providers/provider-status-contract.ts` | provider_runtime | Shared provider status semantics | provider health policy, tests | `isUsableProviderStatus` treated catalog/unverified model-list states as usable provider health | High | `isUsableProviderStatus` is now research-strict: only `healthy` is usable; catalog/unverified display is handled by `canListModels`. |
| `backend/src/core/providers/provider-health.ts` | provider_runtime | Determines research-usable providers | source usage and generation candidate selection | Unverified/catalog statuses could be conflated | High | Added `canChat` semantics and stricter unhealthy reasons. |
| `backend/src/core/providers/provider-run-state.ts` | provider_runtime | Run-wide provider cooldowns | source usage and generation | Stage-local cooldown could repeat failures | High | `shouldSkipProvider` now applies run-wide cooldown. |
| `backend/src/core/providers/provider-errors.ts` | provider_runtime | Safe provider error reports | routes, generation, source usage | Raw provider body risk | High | Existing redaction tests pass. |
| `backend/src/core/pipeline/research-pipeline.ts` | production_core, research_pipeline | Core retrieval/source-usage/generation orchestrator | all research modes | SourceUsageMap aggregate used role max; deep democratic-space target could drift | High | Aggregate now validates and unions IDs; run state shared; dimension engine wired. |
| `backend/src/core/generation/core-answer-generator.ts` | production_core, research_pipeline | Final answer generation and validation | core pipeline | Synthetic SourceUsageMap, unhealthy candidates, unbudgeted prompts, weak repair loop | High | Added guarded synthetic use, health-aware candidates, budget reports, repair rerun. |
| `backend/src/core/generation/core-answer-prompt.ts` | production_core | System/user prompt contracts | core generation | Static democratic-space sections and generic committee prompt | High | Added committee-specific prompts and dynamic output contract. |
| `backend/src/core/generation/prompt-budget.ts` | production_core | Provider prompt budgets | generation | Prompt budget report missing compression detail | Medium | Added compression level in report path. |
| `backend/src/core/generation/section-plan-builder.ts` | production_core | Agenda-dynamic section plan | prompt + deterministic answer + quality gate | File missing | High | Created dynamic section planner. |
| `backend/src/core/evidence/evidence-registry.ts` | research_pipeline | Source canonical registry | retrieval, citation, validation | Indian source classification gaps | High | Expanded Indian domains and social-media handling. |
| `backend/src/core/evidence/evidence-pack-builder.ts` | research_pipeline | Evidence packs for roles/divisions | source usage and generation | Each role received same ordered pack, reducing aggregate union | High | Added deterministic role rotation without faking usage. |
| `backend/src/core/evidence/source-gap-report.ts` | research_pipeline | Shared source-gap report builder | pipeline and generator | Duplicate report builders | Medium | Created single shared implementation. |
| `backend/src/core/evidence/source-usage-map.ts` | research_pipeline | Strict SourceUsageMap validation | source usage and generation | Validation must not be weakened | High | Preserved strict rules; aggregate uses validator output. |
| `backend/src/core/retrieval/query-planner.ts` + `backend/src/core/retrieval/query-planning/*` | research_pipeline | Official Brick 7 bucketed query planner | core research pipeline, search executor, legacy planner adapters | Single-file static planning, weak keywords, shallow generic buckets, resolved drift gaps, legacy fallback query bypasses, and topic-free fallback queries | High | Modularized planner; added topic/mode/freshness/parliamentary/fallback/top-up/LLM expansion modules, telemetry, unified dedupe, compatibility re-export, empty fallback rejection, and generic-query filtering. |
| `backend/src/core/evidence/source-normalizer.ts` | research_pipeline | Normalize raw/enriched sources into EvidenceRegistry source inputs | evidence registry, source scoring, citation eligibility | `general_media` was in the shared `SourceClass` union but missing from bucket/score maps; unknown domains defaulted to `policy_research` | Critical | Added explicit `general_media` mapping and low score; unknown domains now remain bucketless general media. |
| `backend/src/core/evidence/source-usage/*` | research_pipeline | SourceUsageMap normalization, scope enforcement, and validation | role generation, source usage aggregate, claim ledger | Unknown usage types became `supports_claim`; explicit empty assigned-source scopes disabled cross-batch enforcement | High | Unknown usage normalizes to `unknown_invalid` and fails; empty assigned scopes reject all source references. |
| `frontend/src/components/chat/source-panel.tsx` | frontend_runtime | Source registry/sidebar cards | research pipeline source panel | Badge/tier helpers used old source-class names and mislabelled backend structured source classes | Medium | Updated helpers and tests for backend classes such as `official_government`, `parliamentary_records`, `court_primary`, and `general_media`. |
| `backend/src/core/retrieval/bucketed-retrieval.ts` | research_pipeline | Retrieval orchestration | live/mock retrieval | Context-blind top-up and no multi-hop | High | Added contextual top-up, multi-hop hook, content dedupe use. |
| `backend/src/core/retrieval/multi-hop-expander.ts` | research_pipeline | Follow-up query expansion | PhD/Full retrieval | File missing | Medium | Added case/index/Act/entity expansion capped at 20. |
| `backend/src/core/retrieval/source-deduper.ts` | research_pipeline | URL and content dedupe | retrieval | URL-only dedupe left near duplicates | Medium | Added shingle/Jaccard content dedupe. |
| `backend/src/core/security/source-url-policy.ts` | production_core, backend_runtime, security | Source URL allow/deny policy before fetch/extraction | source enrichment, extraction providers | File missing; arbitrary source URLs could reach internal hosts | Critical | Added http/https-only validation, credential rejection, localhost/private/link-local IP blocks, internal hostname blocks, and DNS private-address checks for production fetches. |
| `backend/src/core/retrieval/source-enrichment.ts` | research_pipeline | Jina/snippet enrichment | retrieval | Unbounded `Promise.all` risk; direct readable fetch could fetch unsafe internal URLs | Critical | Added concurrency pool, 429 backoff, and safe URL validation before direct fetches. |
| `backend/src/core/search/search-provider-router.ts` | research_pipeline, provider_runtime | Search/extraction fallback routing | enrichment and search providers | Extractor fallback could pass unsafe URLs into Firecrawl/Jina | Critical | Validates extraction URLs once at the router boundary and returns honest snippet fallback for blocked URLs. |
| `backend/src/core/retrieval/search-executor.ts` | research_pipeline | Live bucketed search execution | retrieval plans | Transient provider failures were swallowed inside fallback routing before retry logic could see them | High | Captures provider runtime failures and rethrows failed single-provider attempts so `withRetries` actually retries. |
| `backend/src/core/retrieval/source-scoring.ts` | research_pipeline | Source class/authority scoring | retrieval filtering | Indian source domains missing | Medium | Added parliamentary, court, government, media, academic domains. |
| `backend/src/core/verification/citation-validator.ts` | research_pipeline | Final citation validation | generator, metadata | Needed complete status fields | High | Existing metadata/citation tests pass. |
| `backend/src/core/verification/hallucination-guard.ts` | research_pipeline | Fake citation/article/case/stat guard | generator and smoke | Pattern-only guard too weak | High | Added real registry checks and overclaim/UN framing checks. |
| `backend/src/core/verification/legal-claim-validator.ts` | research_pipeline | Legal article/case validation | hallucination guard | Known articles/cases incomplete | High | Added known articles, SC cases, dynamic registry cases. |
| `backend/src/core/verification/thesis-quality-gate.ts` | research_pipeline | Final quality gate | generator/final status | D7/D11 and dynamic sections underchecked | High | Added D7/D11/dynamic-section checks. |
| `backend/src/core/verification/repair-orchestrator.ts` | research_pipeline | Targeted answer repair | generator | Generic repair prompts | Medium | Added issue-specific repair templates and deterministic repair helpers. |
| `backend/src/core/archive/archive-merge-safety.ts` | backend_runtime | Archive merge decision | archive save | Partial/fallback merge risk | High | Existing archive safety tests pass. |
| `backend/src/core/pipeline/pipeline-events.ts` | backend_runtime | Typed pipeline event names | SSE/frontend | Missing dimension/multi-hop events | Medium | Added event types. |
| `backend/src/core/run-state/*` | production_core, backend_runtime, research_pipeline | Canonical Brick 22 run-state helpers: terminal status, snapshots, metadata, persistence, cache tags, cancellation, recovery, error taxonomy | core pipeline, anthropic service, cache manager, tests | File set missing; status, metadata, division outputs, and errors were scattered | Critical | Added modular helpers and targeted run-state harness. |
| `backend/src/core/streaming/run-stream/*` | production_core, backend_runtime | Run event envelope, terminal write guard, diagnostics, SSE shape normalization | SSE writer and service route | Content could be written after terminal and legacy events had inconsistent envelope shape | Critical | Added reusable terminal guard and envelope helpers. |
| `frontend/src/components/chat/chat-area.tsx` | frontend_runtime | Main chat UI/payload creation | all chat modes | Generic `done` after terminal errors could mark a partial stream complete | High | Added terminal-failure guard so failed/provider-error/cancelled streams cannot be completed by a later generic done event. |
| `frontend/src/hooks/use-provider-models.tsx` | frontend_runtime, provider_runtime | Provider model state | model dropdowns/settings | Catalog/unverified health risk | High | Contract tests/typecheck cover stricter usable model behavior. |
| `frontend/src/hooks/use-pipeline-state.ts` | frontend_runtime | Pipeline status state | research pipeline UI | Terminal conflated with success; `COMPLETE` could re-derive backend status; division outputs missing | High | `COMPLETE` trusts backend status; division outputs stored per run; terminal semantics moved to run-state helpers. |
| `frontend/src/lib/run-state/*` | frontend_runtime | Modular frontend run-state helpers for terminal semantics, stale guards, division output normalization, reducer helpers | stream normalizer, reducer tests, pipeline UI | File set missing; terminal interpretation lived in chat stream code | High | Added helpers and tests so `final_answer_ready` is non-terminal and only explicit backend terminal statuses end a run. |
| `frontend/src/components/chat/research-pipeline.tsx` | frontend_runtime | Pipeline display | chat research UI | Source gaps/provider errors looked green; budget hidden | High | Added warning/error terminal display and prompt budget panel. |
| `frontend/src/lib/pipeline-metadata.ts` | frontend_runtime | Metadata contract | parsing/display | Citation status schema partial | Medium | Extended citation/prompt budget metadata types. |
| `backend/scripts/smoke-test-*.ts` | test_only | Developer smoke checks | npm smoke scripts | Missing FullSpectrum smokes | Medium | Added division, retrieval, hallucination smokes. |
| `docs/backend-overhaul/*` | stale_doc / production_doc | Diagnosis and repair history | developer handoff | Old reports can overstate status | Medium | Current status, audit, and final report updated. |
| `dist`, `node_modules`, logs, zips | safe_to_archive / safe_to_delete from source packs | Generated/runtime artifacts | not source runtime | Source archive clutter risk | Low | Excluded from final source zip. |

## Duplicate / Legacy Systems

- Legacy multi-search remains present but must be explicit; tests verify core route is default.
- Legacy multi-search and single-model search now persist `legacy_fallback_used` terminal metadata when they produce non-core output. They do not silently merge into archive memory.
- Duplicate source-gap builder logic was merged into `backend/src/core/evidence/source-gap-report.ts`.
- Old docs and logs remain for history but are not current truth; this file and `CURRENT_SYSTEM_STATUS.md` are the current status references.

## Implementation Notes: Persistence Integrity Repair

## Implementation Notes: 2026-05-31 Census Repair Batch

Problem: backend typecheck failed and source classes were inconsistent.
Root cause: `general_media` and `aborted` were added in retrieval/error paths without updating shared maps/unions.
Files changed: `backend/src/core/evidence/source-normalizer.ts`, `backend/src/core/search/search-provider-types.ts`.
Fix: Added explicit mappings and changed unknown domains to low-authority `general_media`.
Runtime reasoning: Unknown sources no longer masquerade as policy research, and budget abort status is typed.
Verification: backend typecheck and focused source/search tests passed.
Remaining risk: deeper source eligibility and evidence-span work remains.

Problem: catalog/unverified providers could be treated as usable.
Root cause: display availability and chat health shared one status helper.
Files changed: `backend/src/core/providers/provider-status-contract.ts`, `backend/src/core/providers/provider-health-policy.ts`, `backend/src/routes/providers.ts`.
Fix: Only `healthy` is research-usable; catalog/unverified can list display models but cannot chat until verified.
Runtime reasoning: model dropdowns can show catalog choices without making research routing lie.
Verification: focused provider tests passed.
Remaining risk: live provider-key acceptance was not run.

Problem: SourceUsageMap could accept malformed source usage.
Root cause: empty role scopes disabled enforcement and unknown usage types normalized to `supports_claim`.
Files changed: `backend/src/core/evidence/source-usage/*`.
Fix: empty explicit scopes reject references and unknown usage becomes `unknown_invalid`.
Runtime reasoning: invalid model output fails honestly instead of becoming positive evidence use.
Verification: focused SourceUsageMap tests passed.
Remaining risk: prompt/schema work should reduce invalid model output frequency.

Problem: route terminal status and deterministic division quality could overstate success.
Root cause: service route used pipeline status when the canonical decision had no error code; deterministic scaffolds were marked quality-passed.
Files changed: `backend/src/core/run-state/terminal-status-decider.ts`, `backend/src/services/anthropic-service.ts`, `backend/src/core/synthesis/division-quality.ts`.
Fix: route uses canonical terminal decision, and deterministic scaffolds fail division quality.
Runtime reasoning: final UI/persistence cannot upgrade stricter failure/source-contract decisions to success.
Verification: focused run-state and synthesis tests passed.
Remaining risk: per-division claim grounding is still future work.

Problem: query/source planning had stale and generic fallback behavior.
Root cause: static buckets had hard-coded EVM phrasing and duplicate official bucket IDs, while legacy fallback could invent generic PhD queries.
Files changed: `backend/src/core/retrieval/source-buckets.ts`, `backend/src/services/research-planner.ts`, `backend/src/core/retrieval/query-planning/query-plan-validator.ts`.
Fix: removed stale EVM query, preserved MEA/MOD official queries in one bucket, rejected empty fallback, and filtered topic-free generic queries.
Runtime reasoning: retrieval starts closer to the user's actual Indian parliamentary agenda and wastes fewer provider calls.
Verification: focused bucket/query-planning tests passed.
Remaining risk: the complete negative query corpus from the census is still pending.

Problem: frontend display did not fully match backend source and metadata contracts.
Root cause: source badges used old source class names and metadata extraction keyed only by assistant message id.
Files changed: `frontend/src/components/chat/source-panel.tsx`, `frontend/src/components/chat/research-pipeline.tsx`, `frontend/src/lib/pipeline-metadata.ts`, `frontend/src/components/chat/persisted-pipeline.tsx`, `frontend/src/components/chat/chat-area.tsx`.
Fix: source badges/tiering understand backend classes, and metadata parsing can enforce `runId + conversationId + assistantMessageId`.
Runtime reasoning: wrong-run metadata and stale source labels are less likely to contaminate persisted chat display.
Verification: focused frontend source-panel, metadata, and citation tests passed.
Remaining risk: old persisted messages without full tuple metadata remain backward-compatible by design.

## Implementation Notes: Brick 22 Run State Repair

Problem: `divisionOutputs` were produced as a `Map` but not delivered reliably.
Root cause: JSON persistence and SSE payloads did not have a stable Map serializer.
Files changed: `backend/src/core/run-state/division-output-serializer.ts`, `backend/src/core/run-state/result-snapshot.ts`, `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/services/anthropic-service.ts`, `frontend/src/lib/run-state/division-output-normalizer.ts`, `frontend/src/hooks/use-pipeline-state.ts`.
Fix: Serialize non-empty division outputs to a JSON-safe object, include them in result snapshots, metadata, SSE events, and frontend run state.
Runtime reasoning: The same immutable snapshot feeds persistence and terminal payloads, so D1-D11 cannot drift between DB and UI.
Verification: `division-output-serializer.test.ts`, `result-snapshot.test.ts`, `division-output-normalizer.test.ts`.
Remaining risk: Legacy fallback has no D1-D11 outputs and correctly emits `{}`.

Problem: `final_answer_ready` and generic `done` frames could terminate or complete frontend runs.
Root cause: Terminal semantics were inferred in the frontend stream normalizer and reducer.
Files changed: `frontend/src/lib/run-state/terminal-event-normalizer.ts`, `frontend/src/lib/run-state/status-semantics.ts`, `frontend/src/components/chat/stream-event-normalizer.ts`, `frontend/src/components/chat/use-chat-run-controller.ts`, `frontend/src/hooks/use-pipeline-state.ts`.
Fix: Only explicit terminal statuses are terminal; `COMPLETE` preserves backend status instead of re-deriving status from source gaps.
Runtime reasoning: Backend status is now the single display truth; local source-gap metadata cannot upgrade or downgrade it.
Verification: `terminal-event-normalizer.test.ts`, `pipeline-run-reducer.test.ts`, frontend stream tests.
Remaining risk: Old persisted messages without terminal metadata still rely on legacy display inference in persisted-message components.

Problem: Empty final answers could be marked completed.
Root cause: Final status decision did not strip metadata/comments and validate visible answer length first.
Files changed: `backend/src/core/run-state/terminal-status-decider.ts`, `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/services/anthropic-service.ts`.
Fix: Strip pipeline metadata and fail empty/metadata-only answers with `EMPTY_FINAL_ANSWER`.
Runtime reasoning: Successful persistence/terminal SSE cannot happen unless there is visible answer text.
Verification: `terminal-status-decider.test.ts`.
Remaining risk: "Visible but semantically poor" answers are still handled by quality gate, not this empty-output guard.

Problem: Source metadata and cited IDs could be assembled from different live objects.
Root cause: Persistence and terminal payloads separately read registry/citation data.
Files changed: `backend/src/core/run-state/result-snapshot.ts`, `backend/src/core/run-state/source-snapshot.ts`, `backend/src/core/run-state/metadata-builder.ts`, `backend/src/services/anthropic-service.ts`.
Fix: Build one immutable result snapshot containing sources, cited IDs, citation report, source contract, quality gate, source gaps, division outputs, fallback flags, and terminal status.
Runtime reasoning: The same snapshot now drives structured metadata, hidden fallback metadata, and SSE terminal diagnostics.
Verification: `result-snapshot.test.ts`, `metadata-builder.test.ts`.
Remaining risk: Snapshot accuracy depends on upstream citation validator truth, which remains outside Brick 22.

Problem: Metadata lived only in fragile hidden HTML comments.
Root cause: The messages table had only `content`.
Files changed: `backend/src/db.ts`, `backend/src/services/assistant-persistence.ts`, `backend/src/core/run-state/persistence-writer.ts`, `backend/src/core/pipeline/pipeline-metadata.ts`.
Fix: Added structured message metadata/run columns and persistence writer support, while preserving hidden comment embedding as compatibility fallback.
Runtime reasoning: Cold reads can prefer structured metadata once wired by callers, and older frontend metadata parsing remains compatible.
Verification: backend typecheck/build and metadata-builder tests.
Remaining risk: Existing UI message queries still return full rows; a future cleanup can explicitly prefer `metadataJson` over embedded comments.

Problem: Legacy/fallback/provider/cancel paths had inconsistent shape and weak diagnostics.
Root cause: Legacy terminal handlers used ad hoc events and failure messages.
Files changed: `backend/src/core/run-state/legacy-result-normalizer.ts`, `backend/src/core/run-state/error-taxonomy.ts`, `backend/src/core/streaming/run-stream/run-event-envelope.ts`, `backend/src/services/anthropic-service.ts`.
Fix: Added normalizers and mode-aware failure titles; provider errors include safe provider/model/status/stage details.
Runtime reasoning: Users see actionable failure context without raw provider payloads or leaked keys.
Verification: `legacy-result-normalizer.test.ts`, `error-taxonomy.test.ts`.
Remaining risk: Some older legacy branches still use compatibility metadata but now pass through the same envelope helper.

Problem: Cache and cancellation were not run-state aware.
Root cause: Cache entries had no run/status tags, and superseded cancellation was fire-and-forget.
Files changed: `backend/src/services/cache-manager.ts`, `backend/src/core/run-state/cache-run-tags.ts`, `backend/src/core/run-state/cancellation-manager.ts`, `backend/src/services/anthropic-service.ts`, `backend/src/core/run-state/run-recovery.ts`.
Fix: Added run/status cache tags with partial/failed reuse blocking, awaited superseded cancellation, abort-controller propagation, and stale running-run recovery helper.
Runtime reasoning: Failed/partial artifacts are not reused as normal success, and old runs are aborted/persisted before the new conversation run proceeds.
Verification: `cache-run-tags.test.ts`, `cancellation-manager.test.ts`, `run-recovery.test.ts`.
Remaining risk: Deep provider/retrieval cancellation depends on each provider honoring `AbortSignal`.

Problem: SSE could write content after terminal.
Root cause: Writers checked socket state but not application terminal state.
Files changed: `backend/src/core/streaming/run-stream/terminal-write-guard.ts`, `backend/src/lib/sse.ts`, `backend/src/core/streaming/stream-writer.ts`.
Fix: Added an application-level terminal guard that blocks non-diagnostic writes after the first terminal frame.
Runtime reasoning: Late chunks/progress cannot overwrite terminal UI state or append content after failure/cancel/completion.
Verification: `terminal-write-guard.test.ts`.
Remaining risk: Any code path bypassing these writers would need the same guard before use.

Problem: Partial normal-mode responses were persisted as final answers after stream errors.
Root cause: The normal stream catch sent an error event but allowed control flow to continue into verification, insert, and archive merge.
Files changed: `backend/src/services/anthropic-service.ts`, `backend/src/services/assistant-persistence.ts`.
Fix: Track stream failure, send `provider_error`, persist an explicit failure message, and skip verification/archive merge.
Runtime reasoning: The same request path that streams tokens now branches before final persistence, so partial `full` text is not committed.
Verification: `assistant-persistence.test.ts` checks failure persistence excludes partial text; backend typecheck passed.
Remaining risk: Live provider disconnect behavior still depends on provider SDK stream error timing.

Problem: Research placeholders could remain or be duplicated by legacy research paths.
Root cause: The route inserted a placeholder before streaming, while legacy final paths inserted a second assistant row.
Files changed: `backend/src/services/anthropic-service.ts`, `backend/src/services/assistant-persistence.ts`.
Fix: Pass run identity into legacy handlers and use `persistAssistantCompleted` to update the placeholder when `assistantMessageId` exists.
Runtime reasoning: One user run now maps to one assistant row across core, single-model, and multi-search paths.
Verification: `assistant-persistence.test.ts` and `persistence-integrity-source.test.ts` cover update-not-insert behavior.
Remaining risk: Rhetorics mode still has its own non-research persistence path because it does not create a placeholder.

Problem: Exhausted research branches returned without a terminal database record.
Root cause: `bothExhausted` sent an SSE event and returned before updating the placeholder.
Files changed: `backend/src/services/anthropic-service.ts`.
Fix: Add `persistResearchExhausted`, which writes failed/source-gap terminal metadata before returning.
Runtime reasoning: The UI and DB now share a terminal status even when no final answer can be synthesized.
Verification: `persistence-integrity-source.test.ts` rejects direct `bothExhausted` returns.
Remaining risk: The source-gap versus failed distinction is based on citation-eligible source count in the legacy path.

Problem: Fallback output could be treated like authoritative research and merged into archive memory.
Root cause: Fallback synthesis wrote assistant content directly and called archive merge without a terminal-status gate.
Files changed: `backend/src/services/anthropic-service.ts`, `backend/src/services/assistant-persistence.ts`.
Fix: Persist fallback as `legacy_fallback_used` metadata and route archive merge through `maybeMergeArchive`.
Runtime reasoning: Archive memory now only receives strict completed validated core answers.
Verification: `assistant-persistence.test.ts` proves fallback/source-gap/failed states do not merge.
Remaining risk: Legacy fallback remains visible to users as a warning state when explicitly enabled.

Problem: Archive deletion could race and violate the at-least-one-archive invariant.
Root cause: Count checks and deletion were separate async store calls.
Files changed: `backend/src/routes/archives.ts`, `backend/tests/archives.test.ts`.
Fix: Replace separate checks with `deleteArchiveIfSafe` running existence, count, linked-conversation check, and delete in one transaction.
Runtime reasoning: Each delete request observes and mutates archive state within the same transactional operation.
Verification: `archives.test.ts` covers `deleted`, `not_found`, `last_archive`, and `has_conversations` outcomes.
Remaining risk: Cross-process SQLite write serialization is still delegated to SQLite/better-sqlite3.

## Frontend Stabilization Addendum - 2026-05-25

Scope: frontend-first stream/state/UI stabilization on branch `frontend-stabilization-ui`. Backend contracts were inspected only where needed for frontend truthfulness. Pre-existing dirty backend files were not reverted or included as part of this frontend pass.

### Frontend Runtime File Classification

| File | Classification | Purpose | Runtime usage / consumers | Known bugs found | Risk | Action taken |
| --- | --- | --- | --- | --- | --- | --- |
| `frontend/src/components/chat/chat-area.tsx` | frontend_runtime | Chat surface, composer, optimistic user messages, mode controls, persisted message rendering | all chat modes | Owned stream lifecycle, model repair, metadata-copy behavior, and live research rail all in one component | High | Removed inline SSE controller, delegated mode/model repair, used metadata-safe copy/citation helpers, and rendered live research sidebar summaries. |
| `frontend/src/components/chat/use-chat-run-controller.ts` | frontend_runtime | Stream lifecycle owner | `ChatArea` send/regenerate/stop actions | File missing; aborts, stale guards, terminal precedence, silence timer, and cache invalidation were embedded in UI component | High | Added hook owning active run identity, abort controllers, SSE parse loop, stale-event rejection, terminal failure precedence, provider success event, and post-run invalidation. |
| `frontend/src/components/chat/stream-event-normalizer.ts` | frontend_runtime | Pure SSE frame normalization | `useChatRunController`, unit tests | File missing; backend event frames were interpreted inline and inconsistently | High | Added typed `NormalizedStreamEvent` union and `ChatRunIdentity`; stale run events are rejected only after backend `run_started` identity is known. |
| `frontend/src/components/chat/use-mode-model-selection.ts` | frontend_runtime, provider_runtime | Mode-specific model selection and repair | `ChatArea` model dropdown and request payloads | Web/deep model hydration and stale repair were duplicated inside `ChatArea` | High | Added pure selection/repair helpers and a hook that repairs stale selections from `healthyResearchModels` without changing nested provider/model IDs. |
| `frontend/src/components/chat/chat-message-list.tsx` | frontend_runtime | Persisted assistant message rendering, citation chips, copy preparation | chat transcript | Citation chips could link regex citations before honoring backend `citationStatus`; copy path relied on local stripping only | High | `citationStatus.citedSourceIds` is now source of truth when present; regex linking is fallback only; display/copy strip hidden pipeline metadata. |
| `frontend/src/components/chat/chat-run-status.tsx` | frontend_runtime | Right-side live research sidebar | active research runs | Showed static sample pipeline/evidence data during real research | High | Replaced fake rows with `summarizeResearchRunSidebar` fed by live pipeline state, citation status, source contract, source gap report, and source manifest. |
| `frontend/src/components/chat/research-pipeline.tsx` | frontend_runtime | Live research answer/pipeline/source panel | active research UI | Live answer/copy/source-panel paths could render or export embedded pipeline metadata | High | `visibleAnswer` is metadata-stripped before display, copy-as-brief, streaming text, and source panel matching. |
| `frontend/src/components/chat/settings-dialog.tsx` | frontend_runtime, provider_runtime | Provider key settings and provider refresh | settings modal, provider model hook | Provider key interface/header logic duplicated local helper code | Medium | Imports `ProviderKeys`, defaults, storage key, and loader from `frontend/src/lib/provider-keys.ts`; provider key save still emits forced refresh event. |
| `frontend/src/lib/provider-keys.ts` | provider_runtime | Canonical provider key storage and header construction | API fetch, provider refresh, stream requests, settings | Duplicate consumers risked header drift | High | Left as single source of provider key/header truth. |
| `frontend/run-src-tests.mjs` | test_only | Source test runner | `npm.cmd test --prefix frontend` | TS/TSX source tests existed but were not run by `npm test` | Medium | Added runner using the repo's installed `tsx` loader from backend dependencies. |

### Frontend Implementation Notes

Problem: The main chat component owned active run identity, abort controllers, SSE parsing, terminal status precedence, and cache invalidation.
Root cause: Stream lifecycle grew inline inside `chat-area.tsx`, coupling rendering and protocol handling.
Files changed: `chat-area.tsx`, `use-chat-run-controller.ts`, `stream-event-normalizer.ts`.
Fix: Moved stream ownership into `useChatRunController` and pure-normalized backend SSE frames before dispatching pipeline actions.
Runtime reasoning: One controller now owns `runId + assistantMessageId + conversationId`; stale run-scoped frames are ignored, and failed/provider-error/cancelled terminals cannot be overwritten by a later generic `done`.
Verification: `npm.cmd test --prefix frontend`, `npm.cmd run typecheck --prefix frontend`, and `npm.cmd run build --prefix frontend` pass.
Remaining risk: Live provider disconnect timing still needs manual browser/SSE acceptance with real keys.

Problem: Model state for normal, fast, deep, PhD, and FullSpectrum selections was repaired in multiple places.
Root cause: `chat-area.tsx` handled localStorage hydration and provider-health repair directly.
Files changed: `use-mode-model-selection.ts`, `chat-area.tsx`, `model-selection-hydration.test.tsx`.
Fix: Added pure model-selection helpers and a hook that repairs selected lists against `healthyResearchModels`.
Runtime reasoning: Request payload model selection now has one mode-aware path, and nested IDs such as `nvidia/moonshotai/kimi-k2.6` remain intact because provider/model splitting is not performed in the frontend repair path.
Verification: Added source tests for stale selection repair and nested model ID preservation through existing provider normalizer tests.
Remaining risk: Live provider health still depends on backend route truthfulness.

Problem: Citation chips and copy/export surfaces could rely on visible regex text instead of backend metadata.
Root cause: Persisted-message rendering parsed `[1]`/`[Source 1]` before checking `citationStatus`.
Files changed: `chat-message-list.tsx`, `research-pipeline.tsx`, `chat-message-list.test.ts`.
Fix: Backend `citationStatus.citedSourceIds` gates citation links when available; metadata stripping is reused for display, copy, live answer, copy-as-brief, and source matching.
Runtime reasoning: The frontend no longer makes a bare citation look valid if backend citation validation did not cite that source.
Verification: Source tests cover metadata stripping and citationStatus-first rendering.
Remaining risk: Old messages without metadata still use regex fallback because no structured backend status exists for them.

Problem: Active research sidebar displayed static evidence/pipeline sample data during real research.
Root cause: `ResearchRunSidebar` used hardcoded rows instead of `usePipelineState`.
Files changed: `chat-run-status.tsx`, `chat-area.tsx`, `chat-run-status.test.tsx`.
Fix: Replaced samples with live summary data from run status, source manifest, citation status, source contract, and source-gap report.
Runtime reasoning: During an active run the rail now shows actual counts/events or an honest "no live sources yet" state.
Verification: Tests assert no static fake rows appear and live metadata counts render.
Remaining risk: The rail only displays data after backend events include source manifests/status fields.

Problem: Rhetorics regenerate could rerun through the normal/research request path.
Root cause: Regenerate reused current mode only and did not preserve the last run's rhetorics options.
Files changed: `chat-area.tsx`, `chat-request-builder.ts` tests.
Fix: `lastRunContextRef` records chat type, mode, model, `rhetoricsType`, and creativity before send; regenerate reuses that context.
Runtime reasoning: A rhetorics answer regenerates with `mode: "rhetorics"` and the same rhetorics options instead of silently becoming a research request.
Verification: Existing request-builder tests plus frontend source tests pass.
Remaining risk: Regenerating an older persisted conversation without in-memory context falls back to current UI mode.

### Frontend Stream and Retrieval Verification Addendum - 2026-05-25

| File | Classification | Purpose | Runtime usage / consumers | Known bugs found | Risk | Action taken |
| --- | --- | --- | --- | --- | --- | --- |
| `frontend/src/components/chat/stream-controller-registry.ts` | frontend_runtime | Owns abort-controller registry mutations by run and conversation | `useChatRunController`, stream lifecycle tests | Abort scopes were implicit and conversation cleanup could call the all-stream cleanup path | High | Added tested helpers for add, move, single-run abort, conversation abort, and full unmount abort. |
| `frontend/src/components/chat/use-chat-run-controller.ts` | frontend_runtime | Stream lifecycle owner | `ChatArea` send/regenerate/stop actions | Cleanup effect was terse enough to be misread; abort registry did not encode conversation ownership | High | Made unmount cleanup explicit and switched controller storage to run + conversation entries. |
| `frontend/src/components/chat/chat-area.tsx` | frontend_runtime | Chat shell and conversation-switch cleanup | all chat modes | Conversation cleanup returned all-stream abort instead of a conversation-scoped abort callback | High | Conversation switches now abort only controllers owned by the previous conversation id. |
| `frontend/src/components/chat/model-limits.tsx` | frontend_runtime | Daily usage counter panel | chat sidebar | LocalStorage usage state flashed from zero before hydration | Medium | Initial React state now calls `loadState()` synchronously; update listeners still refresh after mount. |
| `frontend/src/components/chat/use-mode-model-selection.ts` | frontend_runtime, provider_runtime | Mode-specific model lists and stale-model repair | model dropdown and request payload builder | Repair effect performed state writes after render, causing extra repair renders | Medium | Repair is derived with `useMemo`; setters repair incoming selections before storing raw state. |
| `backend/src/core/retrieval/bucketed-retrieval.ts` | research_pipeline | Bucketed live retrieval, source gap reporting, top-up, expansion | `runResearchPipeline` live source path | No-key live search was caught for the first pass but strict top-up/expansion retried and threw `RetrievalError` | High | Top-up and multi-hop expansion are skipped after an initial retrieval failure so the pipeline returns an honest source-gap report. |
| `backend/package.json` | test_only | Backend package scripts | local and CI test command | Full test suite had process-env races between provider/search tests under parallel file execution | Medium | Backend `npm test` now runs Node tests with `--test-concurrency=1` to match shared-env test assumptions. |

Problem: Stream cleanup was ambiguous and conversation cleanup used the all-stream abort surface.
Root cause: The hook used `useEffect(() => abortAllStreams, ...)`, which is a valid cleanup return but easy to misread, and `ChatArea` returned `abortAllStreams` from the conversation effect.
Files changed: `frontend/src/components/chat/use-chat-run-controller.ts`, `frontend/src/components/chat/chat-area.tsx`, `frontend/src/components/chat/stream-controller-registry.ts`.
Fix: Added a stream controller registry keyed by run id with conversation ownership; unmount cleanup is now `return () => abortAllStreams()`, while conversation-switch cleanup calls `abortStreamsForConversation(conversationId)`.
Runtime reasoning: A page unmount still cancels streams owned by that mounted chat controller, but switching conversations no longer calls the all-stream abort path.
Verification: `stream-controller-registry.test.ts` proves conversation abort, single-run abort, run-id move, and full abort scopes; frontend tests and root build pass.
Remaining risk: Cross-browser-tab streams remain isolated by each tab's JavaScript runtime; there is no shared cross-tab stream registry.

Problem: The model usage panel rendered zero usage before loading persisted localStorage state.
Root cause: `ModelLimitsPanel` initialized with `emptyState` and only called `loadState()` in a post-render effect.
Files changed: `frontend/src/components/chat/model-limits.tsx`, `frontend/src/components/chat/model-limits.test.tsx`.
Fix: Changed the state initializer to `useState(() => loadState())` and removed the redundant mount-time `setState(loadState())`.
Runtime reasoning: The first render now uses the same persisted usage state as later storage/event refreshes.
Verification: `model-limits.test.tsx` pins synchronous hydration; `npm.cmd test --prefix frontend` passes.
Remaining risk: Usage can still update after mount from storage events or the 30-second refresh interval, as intended.

Problem: Mode model repair caused extra render cascades after provider model health changed.
Root cause: `useModeModelSelection` repaired stale selections inside an effect by calling `setNormalModel`, `setWebSearchModels`, and `setDeepResearchModels`.
Files changed: `frontend/src/components/chat/use-mode-model-selection.ts`, `frontend/src/components/chat/model-selection-hydration.test.tsx`.
Fix: Removed the state-repair effect; mode selections are repaired as derived state with `useMemo`, and setter callbacks repair incoming lists before storing them.
Runtime reasoning: The provider-health render that changes `healthyResearchModels` now produces repaired request payloads immediately without a second repair render from this hook.
Verification: `use-mode-model-selection.test.ts` and `model-selection-hydration.test.tsx` pass with the full frontend suite.
Remaining risk: The normal-model owner remains `useProviderModels`; this hook derives a repaired normal model for mode resolution but does not own that state.

Problem: No-key live retrieval could still throw out of strict research modes during verification.
Root cause: `runBucketedRetrieval` caught the first `RetrievalError`, but top-up and multi-hop expansion retried with the same missing keys and let the error escape.
Files changed: `backend/src/core/retrieval/bucketed-retrieval.ts`, `backend/tests/retrieval/search-executor.test.ts`, `backend/tests/retrieval/search-executor-real-provider.test.ts`, `backend/tests/integration/*`, `backend/tests/evidence/source-usage-live-real.test.ts`.
Fix: Skipped strict top-up and expansion after an initial retrieval failure; updated tests to assert honest `RetrievalError` at the low-level executor and honest `SourceGapReport` at the pipeline boundary.
Runtime reasoning: Low-level live search still fails loudly when every configured provider fails, while the research pipeline converts missing retrieval into a visible source-gap path instead of fake deterministic sources.
Verification: Targeted retrieval/integration tests pass; full backend suite passes with 372 passed and 5 skipped.
Remaining risk: Live external provider behavior still depends on real search keys and provider uptime.

Problem: Backend full tests were order-sensitive under Node's default parallel test-file execution.
Root cause: Several provider/search tests intentionally mutate `process.env`; when test files ran in parallel, unrelated files observed temporary env values.
Files changed: `backend/package.json`.
Fix: Added `--test-concurrency=1` to the backend `npm test` script.
Runtime reasoning: This changes only the local/CI test runner scheduling; app runtime provider behavior is unchanged.
Verification: `npm.cmd test --prefix backend` passes with 372 passed, 5 skipped, 0 failed.
Remaining risk: Individual tests still mutate process env; future tests should restore env state carefully.

Problem: Root build verification failed on current dirty backend retrieval/crawler work.
Root cause: `bucketed-retrieval.ts` stored raw search results in a `RetrievalSource[]` variable before shaping, and `UnifiedCrawlerOptions` omitted `snippet` and `maxConcurrency` fields used by the new crawler router.
Files changed: `backend/src/core/retrieval/bucketed-retrieval.ts`, `backend/src/core/search/unified-crawler-router.ts`.
Fix: Kept `rawResults` typed as `RawSearchResult[]` until scoring/shaping, and added the missing crawler option fields.
Runtime reasoning: Retrieval keeps raw provider output separate from shaped/scored sources, while crawler batch extraction can carry snippet fallback text and concurrency settings through typed options.
Verification: `npm.cmd run typecheck --prefix backend` and root `npm.cmd run build` pass.
Remaining risk: These backend files were already dirty before the frontend pass; live retrieval behavior still needs targeted backend smoke verification if this backend work is intended for release.

### Security and Provider Runtime Addendum - 2026-05-25

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/core/security/source-url-policy.ts` | production_core, backend_runtime, security | Central source URL SSRF guard | source enrichment, extraction providers | Missing before this pass | No duplicate guard existed | Critical | Added validation before any source URL fetch/extractor handoff. |
| `backend/src/core/retrieval/source-enrichment.ts` | research_pipeline | Readable source text fetch and enrichment fallback | `enrichSourcesConcurrent`, bucketed retrieval | Direct fetches accepted localhost/private/link-local URLs | Jina helper duplicated URL construction | Critical | Direct fetch and Jina helper validate source URLs before fetching. |
| `backend/src/core/search/search-provider-router.ts` | research_pipeline, provider_runtime | Search/extraction fallback | Firecrawl/Jina extraction path | Unsafe URLs could enter extractor providers | Firecrawl/Jina each called fetch-like APIs separately | Critical | Router blocks unsafe URLs once and returns snippet fallback metadata instead of fetching. |
| `backend/src/core/search/providers/jina-extractor-provider.ts` | provider_runtime, research_pipeline | Jina Reader extraction | `extractWithFallback`, health check | Jina reader URL could wrap unsafe source URL | Legacy helper in source enrichment | Critical | Validates the original source URL and uses the shared Jina reader URL builder. |
| `backend/src/core/search/providers/firecrawl-extractor-provider.ts` | provider_runtime, research_pipeline | Firecrawl extraction | `extractWithFallback`, health check | Firecrawl request body could carry unsafe source URL | None | High | Validates the original source URL before sending it to Firecrawl. |
| `backend/src/core/providers/provider-key-extraction.ts` | provider_runtime | Canonical header/env key extraction | all provider routes via `extractKeys` | Ollama env fallback was not in the shared extractor | Older helpers also read env directly | Medium | Added `OLLAMA_API_KEY` and `OLLAMA_BASE_URL` to the canonical contract. |
| `backend/src/core/providers/provider-status-contract.ts` | provider_runtime | Status usability helper | provider health policy | Exported helper was unused and only mapped `healthy` | Health policy had separate fallback model-list logic | Medium | Helper now means model-list/display usability; health policy imports it while keeping fallback not healthy. |
| `backend/src/routes/providers.ts` | provider_runtime | Provider model/status routes | `/api/providers/status`, model dropdown refresh | Status timeout was only configurable from internal tests | Hardcoded defaults inside provider probes | Medium | Added `PROVIDER_STATUS_TIMEOUT_MS` runtime configuration and emits `timeout` status. |
| `backend/src/core/retrieval/search-executor.ts` | research_pipeline | Live search plan execution | retrieval/search path | Retry wrapper could not see provider HTTP failures swallowed by fallback routing | Older unused provider-specific call helpers remain | High | Captures single-provider fallback failures and rethrows them into `withRetries`. |
| `backend/src/services/division-engine.ts` | research_pipeline, streaming | Division synthesis model calls | core pipeline via `runDivisionPipeline` | Reported as not wired; current runtime already streams via `onDivisionChunk` | Stale TODO in `synthesis.ts` | Medium | Added regression coverage proving progressive chunks are emitted. |

Problem: Source enrichment could fetch attacker-controlled internal URLs.
Root cause: `fetchReadableText`, the Jina reader helper, and extraction providers accepted arbitrary URL strings without an allow/deny policy.
Files changed: `backend/src/core/security/source-url-policy.ts`, `backend/src/core/retrieval/source-enrichment.ts`, `backend/src/core/search/search-provider-router.ts`, `backend/src/core/search/providers/jina-extractor-provider.ts`, `backend/src/core/search/providers/firecrawl-extractor-provider.ts`.
Fix: Added a central source URL policy allowing only HTTP/HTTPS, rejecting credentials, localhost, private/link-local IP ranges, internal hostnames, and production DNS resolutions to blocked addresses; applied it before direct fetches and extractor handoff.
Runtime reasoning: The retrieval path now blocks unsafe source URLs before the server calls `fetch` or asks Jina/Firecrawl to extract content, then falls back to snippet metadata with an explicit unsafe URL error instead of silently fetching.
Verification: `node --import tsx --test tests/retrieval/source-enrichment-concurrency.test.ts` passes and asserts zero fetch calls for localhost, private IP, link-local metadata, IPv6 loopback, and non-http URLs.
Remaining risk: DNS resolution is skipped for injected custom `fetchFn` test paths; production default fetch performs the DNS private-address check before fetching.

Problem: Provider env fallback was inconsistent across routes.
Root cause: `extractProviderKeys` did not include Ollama env values, while several route helpers mixed canonical extraction with direct `process.env` fallback.
Files changed: `backend/src/core/providers/provider-key-extraction.ts`, `backend/tests/providers/provider-key-extraction.test.ts`.
Fix: Added `OLLAMA_API_KEY` and `OLLAMA_BASE_URL` to canonical extraction and expanded server-env fallback coverage across provider/search/extraction keys.
Runtime reasoning: Routes that call `extractKeys(req)` now see the same server env values as lower-level provider clients, reducing route-specific fallback drift.
Verification: `node --import tsx --test tests/providers/provider-key-extraction.test.ts` passes.
Remaining risk: Some legacy client constructors still read `process.env` directly for backward compatibility.

Problem: `isUsableProviderStatus` was exported but stale and unused.
Root cause: The helper only returned true for `healthy`, while the live route contract distinguishes health from display/model-list usability through `canChat`, `canListModels`, and `catalogFallbackOnly`.
Files changed: `backend/src/core/providers/provider-status-contract.ts`, `backend/src/core/providers/provider-health-policy.ts`, `backend/tests/providers/provider-status-contract-usage.test.ts`.
Fix: Made the helper express model-list/display usability (`healthy`, `catalog_fallback`, `unverified`) and wired it into health policy for `canListModels`.
Runtime reasoning: Catalog fallback can still show model choices but remains `healthy: false`, `canChat: false` by default, and `catalogFallbackOnly: true`, preserving provider-health truth.
Verification: `node --import tsx --test tests/providers/provider-status-contract-usage.test.ts tests/providers/provider-health-policy.test.ts` passes.
Remaining risk: Future callers must not use `isUsableProviderStatus` as a chat/research health check; use `canChat`/provider health policy for that.

Problem: Provider status probes had no runtime-level timeout knob.
Root cause: `buildProviderStatusPayload` accepted internal `timeoutMs`, but route/runtime behavior always fell back to a hardcoded default.
Files changed: `backend/src/routes/providers.ts`, `backend/tests/providers/provider-status-parallel.test.ts`.
Fix: Added `PROVIDER_STATUS_TIMEOUT_MS` parsing and changed provider timeout failures to terminal `timeout` status.
Runtime reasoning: Slow environments can tune provider status probing without code changes, and timed-out probes no longer look like generic network errors.
Verification: `node --import tsx --test tests/providers/provider-status-parallel.test.ts` passes.
Remaining risk: Individual model-list endpoints still have provider-specific fetch timeouts; this fix targets aggregate provider status probing.

Problem: Search retry coverage exposed that transient HTTP failures were not retried.
Root cause: `searchWithFallback` captured provider errors and returned an empty list before `runSearchPlan`'s `withRetries` wrapper could observe a rejected attempt.
Files changed: `backend/src/core/retrieval/search-executor.ts`, `backend/tests/retrieval/search-executor.test.ts`.
Fix: `callSearchProvider` now creates runtime metadata for the single provider, detects provider failures with no results, and throws that failure into `withRetries`.
Runtime reasoning: Empty-but-successful searches still return empty results, while provider HTTP failures now retry according to the plan retry policy and only then become retrieval errors.
Verification: `node --import tsx --test tests/retrieval/search-executor.test.ts` passes and asserts third-attempt recovery.
Remaining risk: Multi-provider fallback behavior still intentionally continues across providers in the lower-level search router.

Problem: Reported synthesis streaming was described as unwired.
Root cause: The comment in `synthesis.ts` was stale relative to the active division-engine path; `runDivisionPipeline` already passes `onDivisionChunk` into `callModel`, which sets `stream: true` and forwards deltas.
Files changed: `backend/src/services/synthesis.ts`, `backend/tests/division-pipeline.test.ts`.
Fix: Replaced the stale TODO with an accurate note and added regression coverage for progressive division chunks.
Runtime reasoning: The actual core research route calls `runDivisionPipeline(..., { onDivisionChunk })`, so the tested division-engine callback is the user-facing SSE chunk source.
Verification: `node --import tsx --test tests/division-pipeline.test.ts` passes.
Remaining risk: The standalone `streamSynthesis` helper remains separate from the active division pipeline; the active path is covered.

## Current Risks

- Live provider and live search behavior requires real keys. Local tests and smokes verify no-key semantics and local deterministic behavior, not external uptime.
- Frontend TSX unit tests added in source are typechecked; the configured frontend `npm test` currently runs `dev-config.test.mjs`.
- Vite build still warns about a large JS chunk. It does not fail the build.

## Phase 2 Frontend Modularization Addendum - 2026-05-23

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frontend/src/hooks/use-provider-models.tsx` | frontend_runtime | Provider runtime context, refresh orchestration, selected model state | Provider dropdowns, chat model selection, settings refresh | Chat/settings provider consumers | Pure status/model/repair rules were embedded and hard to test | Phase 1 core helper existed separately | High | Extracted provider-model helpers; retained React state/effects/events |
| `frontend/src/hooks/provider-models/*` | frontend_runtime | Provider types, status normalization, model normalization, selection repair | Provider model refresh and research-usable model calculation | `use-provider-models.tsx`, tests | Needed strict catalog/network/unavailable semantics and nested ID preservation | Replaces hook-local logic | High | Created tested helpers |
| `frontend/src/hooks/use-provider-models-core.ts` | test_only | Backward-compatible pure helper import path | Existing Phase 1 tests | `use-provider-models.test.ts` | Could drift from Phase 2 helpers | Wrapper over new helpers | Low | Re-exported new helpers |
| `frontend/src/components/chat/chat-area.tsx` | frontend_runtime | Main chat shell, stream owner, optimistic update owner | All chat modes | Chat page | Request body, timeout, and stale event checks were inline | No duplicate runtime after extraction | High | Extracted pure helpers only; did not move state or `runStream` ownership |
| `frontend/src/components/chat/chat-request-builder.ts` | frontend_runtime | Chat POST body builder | `chat-area.tsx` | tests | New helper | None | High | Created parity-tested helper |
| `frontend/src/components/chat/stream-timeout.ts` | frontend_runtime | Mode-aware SSE silence timeout | `chat-area.tsx` stream watchdog | tests | New helper | None | Medium | Created parity-tested helper |
| `frontend/src/components/chat/stale-event-guard.ts` | frontend_runtime | Run-scoped stale SSE event guard | `chat-area.tsx` event loop | tests | New helper | None | High | Created guard with run/assistant/conversation checks |
| `frontend/src/components/chat/research-pipeline.tsx` | frontend_runtime | Research pipeline layout orchestration | Active research UI | `chat-area.tsx` | Large guarded pipeline presentational block made terminal state clarity brittle | Inline panels duplicated display logic | High | Extracted status, source contract, quality gate, prompt budget, provider runtime, and source list panels |
| `frontend/src/components/chat/research-pipeline/*` | frontend_runtime | Research pipeline presentational panels and semantics | Active research guarded UI | `research-pipeline.tsx`, tests | Needed warning/error semantics for source gaps, fallback, provider errors | Replaces inline guarded cards | High | Created real panel components and status semantics tests |
| `frontend/dev-config.test.mjs` | test_only | Configured frontend test command | `npm test --prefix frontend` | npm script | Source assertions referenced pre-Phase-2 hook internals | Source-based smoke style | Medium | Updated to assert helper-module layout |
| `docs/backend-overhaul/frontend-phase-2-modularization-audit.md` | production_doc | Phase 2 file classification and runtime path audit | Developer handoff | docs | New doc | Complements full repo audit | Low | Created |
| `docs/backend-overhaul/frontend-phase-2-modularization-report.md` | production_doc | Phase 2 implementation and verification report | Developer handoff | docs | New doc | Complements current status docs | Low | Created |

## Research Capability Mega Stabilization Addendum - 2026-05-25

This addendum is scoped to the requested research capability stabilization pass in `BestDel-refactor-local`. It does not replace the broader audit above; it classifies the runtime files touched for provider routing, freshness routing, evidence retrieval, extraction, prompt budgeting, verification, final status, and frontend safety.

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/core/freshness/freshness-router.ts` | normal_mode_only, rhetorics_mode_only, research_pipeline | Deterministic freshness detection for current/current-affairs prompts | `anthropic-service.ts` checks normal/rhetorics/drafting prompts before generation | Chat route service | Missing before this pass; current political/legal/conflict prompts could use stale model memory | None | Critical | Added freshness detector and tests |
| `backend/src/services/anthropic-service.ts` | backend_runtime, research_pipeline | Main chat/research entrypoint | Normal, rhetorics, drafting, web/fast/deep/phd/full requests | Frontend chat route | Fresh current facts could bypass retrieval; legacy fallback could be primary | Legacy `handleMultiSearch` remains fallback-only | Critical | Freshness prompts route to evidence path; research modes use core pipeline |
| `backend/src/core/pipeline/research-pipeline.ts` | research_pipeline | Evidence-grounded retrieval/generation orchestration | All research modes after routing | Service layer, tests | Terminal SSE states and default live retrieval were incomplete | Legacy fallback remains explicit | Critical | Added all-mode retrieval defaults, terminal event truth, degraded fallback semantics |
| `backend/src/core/providers/provider-run-state.ts` | provider_runtime | Per-run provider/model failure memory | Core generation candidate selection | Provider/generation core | Failure skip was not applied uniformly across strict modes | None | Critical | Invalid/rate-limit/timeout/failure skip applies across modes |
| `backend/src/core/providers/provider-health-policy.ts` | provider_runtime | Provider health interpretation | `/api/providers/status`, frontend status | Provider routes/tests | Health conflated catalog fallback with usable chat health | Static catalog fallback display remains separate | High | Added distinct chat/list/live/failure fields |
| `backend/src/routes/providers.ts` | provider_runtime | Provider model/status API route | Frontend provider settings/model refresh | Frontend settings and provider hooks | Deprecated Gemini fallback and generic 404 status | Static catalog display fallback | High | Removed Gemini 1.5 fallback; mapped invalid models; surfaced health fields |
| `backend/src/core/retrieval/source-buckets.ts` | research_pipeline | Topic bucket definitions | Query planner/bucketed retrieval | Retrieval planner | Generic democracy/parliament buckets for unrelated topics | None | High | Added topic-specific Indian Parliament bucket sets |
| `backend/src/core/retrieval/query-planner.ts` | research_pipeline | Agenda-aware search query generation | Bucketed retrieval | Source buckets, agenda contract | Generic/malformed queries, duplicate years, weak current variants | None | High | Added placeholder replacement, year/entity preservation, freshness variants |
| `backend/src/core/retrieval/search-executor.ts` | research_pipeline | Provider-aware search execution | Live retrieval | Unified search router | `site:` syntax sent to providers that do not support it | Provider-specific search routers still exist underneath | High | Added provider-aware query transform and cross-provider merge behavior |
| `backend/src/core/retrieval/bucketed-retrieval.ts` | research_pipeline | Bucketed retrieval and enrichment coordination | `runResearchPipeline` | Query planner, enrichment, scoring | No early stopping; budgets/signals/fullTextRequired not enforced enough | None | Critical | Added early stop, abort budget propagation, full-text eligibility enforcement |
| `backend/src/core/retrieval/source-enrichment.ts` | research_pipeline | Readable source extraction | Retrieval enrichment | Bucketed retrieval, tests | Regex-only fallback; unsafe URLs; noisy long text marked strong | Extractor providers remain optional | Critical | Added Readability/linkedom, text cap, density quality, URL policy, AbortSignal support |
| `backend/src/core/security/source-url-policy.ts` | backend_runtime, research_pipeline | Central outbound source URL safety policy | Direct fetch/Jina/Firecrawl/router extraction | Source enrichment and extractor providers | Needed central SSRF/metadata protection | None | Critical | Blocks unsafe schemes, localhost/private/link-local/metadata targets |
| `backend/src/core/evidence/evidence-compressor.ts` | research_pipeline | Deterministic evidence-card compression | Prompt builder/generation | Core answer prompt/budget tests | Needed compressed source cards instead of raw page dumps | None | Critical | Preserves source IDs/metadata/facts/numbers/holdings within mode budgets |
| `backend/src/core/evidence/evidence-registry.ts` | research_pipeline | Source eligibility registry | Source contract, citation validation, prompt pack | Retrieval/pipeline | Title-only/snippet-only sources could remain too strong | None | Critical | Demoted weak/title-only evidence and preserved strict eligibility |
| `backend/src/core/evidence/source-usage-map.ts` | research_pipeline | Strict evidence usage validation | Model role/source usage checks | Pipeline/synthesis | Title-only/source-id-only usage could be counted | None | Critical | Requires real extraction/support; rejects ineligible weak sources |
| `backend/src/core/generation/core-answer-generator.ts` | research_pipeline, provider_runtime | Final answer generation and provider routing | Core pipeline | Provider router, prompt builder | Missing provider router could null-fallback; source gap warning prompt-dependent | None | Critical | Throws typed config error and injects source-gap notice after generation |
| `backend/src/core/generation/prompt-budget.ts` | research_pipeline | Provider/mode prompt budget estimation | Prompt/evidence pack building | Core generation | Token estimate too optimistic; Groq budget too low | None | High | Added safer estimator and updated Groq large-context budgets |
| `backend/src/core/verification/citation-validator.ts` | research_pipeline | Citation/source coverage validation | Quality gate and repair path | Pipeline verification | Hardcoded 30 linked citation threshold | Repair orchestrator remains downstream | Critical | Mode-aware unique coverage; repeated spam still guarded |
| `backend/src/core/verification/hallucination-guard.ts` | research_pipeline | Numeric/legal claim support checks | Verification path | Quality gate/validator tests | Broad text number checks and weak Article support | Legal claim validator complements it | High | Structured keyNumber normalization and Article-specific support checks |
| `frontend/src/components/chat/research-pipeline/status-semantics.ts` | frontend_runtime | Pipeline terminal status semantics | Research pipeline UI | `research-pipeline.tsx`, persisted pipeline | Source gaps/fallback/degraded states could look like success | Persisted pipeline uses same semantics | High | Added warning/error semantics for degraded/source-gap/provider states |
| `frontend/src/hooks/use-pipeline-state.ts` | frontend_runtime | Client-side pipeline event state reducer | Active research UI | Chat components | Complete event could overwrite warning/degraded terminal states | Stream normalizer also guards events | High | Prevented normal completion overwrite of fallback/source-gap/provider states |
| `frontend/src/components/ui/chart.tsx` | frontend_runtime | Chart CSS variable style injection | UI chart rendering | Chart consumers | Unsanitized color config before `dangerouslySetInnerHTML` | None | Critical | Added color/key sanitizer with tests |
| `docs/backend-overhaul/research-capability-mega-fix-report.md` | production_doc | Required implementation report and bug matrix | Developer/QA handoff | This stabilization pass | Missing before this pass | Complements current status/full audit docs | Medium | Created report with phase matrix and verification status |

Implementation notes for this addendum are in `docs/backend-overhaul/research-capability-mega-fix-report.md`.

## Final Source Feeding + Provider Control Addendum - 2026-05-26

This addendum records the final implementation pass for explicit provider control, Groq model selection stability, provider diagnostics, source-card feeding, citation repair, deterministic cited fallback, fast source-usage behavior, retrieval budgets, and overlapping-run protection.

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/services/anthropic-service.ts` | backend_runtime, research_pipeline | Main chat/research entrypoint and request parser | Normal, rhetorics, web/fast/deep/phd/full requests | Frontend chat stream route | Non-empty invalid model prefixes could be silently replaced by defaults | Legacy fallback remains explicit only | Critical | Validates prefixes, preserves nested model IDs, logs resolved provider/model/autoFallback, passes abort signal and autoFallback |
| `backend/src/core/providers/model-strategy.ts` | provider_runtime | Provider/model candidate strategy | Research provider selection | Generation/source-usage callers | Default chains could imply silent provider fallback | Fallback lists remain explicit only | Critical | Fallback candidates are gated behind `autoFallback` |
| `backend/src/core/synthesis/model-role-runner.ts` | provider_runtime, research_pipeline | SourceUsageMap generation and deterministic extraction | Source usage roles before final generation | Research pipeline | Source usage could bounce through providers and burn generation budget | Deterministic extraction is the fast default | Critical | Fast research uses deterministic source usage by default; model retry is bounded and fallback is explicit |
| `backend/src/core/providers/provider-errors.ts` | provider_runtime | Provider error classification and safe reports | Provider/router/generation/search handling | Provider run state, diagnostics | HTTP 402 was unknown and retryable-looking | None | High | Added `billing_credits` and non-retryable HTTP mappings |
| `backend/src/core/providers/provider-run-state.ts` | provider_runtime | Per-run provider/model failure memory | Core generation and source usage | Generation/source usage runners | 401/402/403/404/429 skip behavior needed tighter run-local blocking | None | Critical | Blocks invalid keys/models/billing/rate limits/request-too-large fingerprints per run |
| `backend/src/core/providers/provider-health-policy.ts` | provider_runtime | Model-list and chat health interpretation | Provider status APIs/frontend status | `routes/providers.ts`, frontend normalizer | Catalog/list health could be confused with chat readiness | Catalog fallback remains display-only | Critical | Added `chatVerified`, live model-list and catalog-fallback semantics |
| `backend/src/core/providers/provider-health.ts` | provider_runtime | Research provider filtering | Generation/source usage provider candidate selection | Model strategy/generation/source usage | Selected provider could bypass bad model endpoint status | None | Critical | Explicit bad endpoint statuses now win before selected-provider allowance |
| `backend/src/routes/providers.ts` | provider_runtime | Provider status, model route, diagnostics APIs | Settings Save, provider dropdowns, diagnostics smoke | Frontend provider hooks/settings | Status payload needed status codes, chatVerified, catalog fallback and rate-limit fields | Static catalogs remain display fallback only | High | Exposes structured diagnostics and logs provider route/status checks |
| `backend/src/core/generation/core-answer-generator.ts` | research_pipeline, provider_runtime | Final answer provider execution, repair, fallback | Core research final synthesis | Pipeline, prompt builder, validators | Under-citation hard-failed before repair; automatic fallback used broad defaults | Deterministic cited fallback is explicit degraded path | Critical | Repairs source selection, attempts citation repair, uses deterministic cited fallback, gates fallback providers behind autoFallback |
| `backend/src/core/generation/core-answer-prompt.ts` | research_pipeline | Final prompt construction | Core answer generation | Prompt budget/evidence compressor | Compression could under-feed final source cards | None | Critical | Enforces required source labels and URLs before model call |
| `backend/src/core/generation/prompt-budget.ts` | research_pipeline | Mode/provider prompt budgets | Final prompt/evidence pack sizing | Core answer prompt | Fast Groq source target was too low | None | High | Adds source-card targets and preserves required source counts while compressing content |
| `backend/src/core/evidence/evidence-compressor.ts` | research_pipeline | Source-card compression | Final prompt source pack | Core prompt builder | Forced source IDs could still be dropped | None | Critical | Adds must-include source IDs and minimal retained source cards |
| `backend/src/core/pipeline/final-status.ts` | research_pipeline | Terminal status decision | Research pipeline completion | SSE/persistence/archive gating | Source-gap completion could be possible with zero citations | None | Critical | Requires citations for source gaps and degraded fallback |
| `backend/src/core/pipeline/research-pipeline.ts` | research_pipeline | Retrieval, source usage, generation orchestration | All research modes | Anthropic service and tests | Manual terminal status selection bypassed citation/source truth | Legacy fallback remains explicit only | Critical | Uses final-status decider, passes abort signals, returns cited degraded fallback when possible |
| `backend/src/core/retrieval/bucketed-retrieval.ts` | research_pipeline | Bucketed search and enrichment coordination | Live retrieval | Search providers, enrichment | Provider provenance and budget stops needed hardening | None | High | Preserves provider provenance, passes abort/budget, stops after enough strong sources |
| `backend/src/core/retrieval/source-enrichment.ts` | research_pipeline | Firecrawl/Jina/readability/snippet enrichment | Live source enrichment | Retrieval tests and providers | Extraction could overrun fast budget or ignore abort | None | High | Adds AbortSignal propagation and budget-aware fallback |
| `frontend/src/hooks/provider-models/provider-status-normalizer.ts` | frontend_runtime | Provider status interpretation | Provider dropdown/status UI | `use-provider-models.tsx` | 206/catalog fallback could be treated as research health | None | High | Splits displayable/selectable/chatVerified semantics |
| `frontend/src/hooks/provider-models/model-selection-repair.ts` | frontend_runtime | Model selection repair | Provider model refresh | `use-provider-models.tsx` | Repair could prefer NVIDIA Kimi and overwrite Groq | None | High | Preserves explicit user selection and removes global provider preference |
| `frontend/src/hooks/use-provider-models.tsx` | frontend_runtime | Provider refresh, selected models, persistence | Chat/settings model state | Chat area/settings | Refresh could persist auto-repaired selections | Helper modules | High | Persists only explicit user selections and keeps catalog fallback displayable |
| `frontend/src/components/chat/chat-request-builder.ts` | frontend_runtime | Chat request body construction | Research/normal/rhetorics sends | Chat run controller | Request body lacked autoFallback | None | High | Sends explicit `autoFallback` |
| `frontend/src/components/chat/chat-area.tsx` | frontend_runtime | Chat shell, active run controls, model UI | User-facing chat | Stream controller/settings/provider hooks | Overlapping research sends and autoFallback UI needed integration | Extracted controller modules | Critical | Adds autoFallback setting path, active-run disable/cancel affordance, run-scoped state |
| `frontend/src/components/chat/use-chat-run-controller.ts` | frontend_runtime | Chat stream lifecycle | SSE request/abort/event flow | Chat area | Backend run could outlive frontend run and stale events could mutate UI | Stale guard complements it | Critical | Sends autoFallback, aborts/cancels active runs, honors terminal failure states |
| `backend/scripts/smoke-test-provider-route-semantics.ts` | test_only | Provider route semantics smoke | Manual verification | Backend package script | Stale expectation treated 206 catalog fallback as 200 | None | Medium | Verifies 206 catalog fallback, `chatVerified=false`, and billing 402 |
| `docs/backend-overhaul/final-research-source-feeding-provider-control-report.md` | production_doc | Final implementation report | Developer/QA handoff | This pass | Missing before this pass | Complements current status/full audit docs | Medium | Created with root cause, files, behavior, tests, smokes, and remaining risks |

Verification for this addendum:

- `npm.cmd run typecheck --prefix backend`
- `npm.cmd test --prefix backend` - 485 pass, 0 fail, 5 skipped live-key tests
- `npm.cmd run build --prefix backend`
- `npm.cmd run typecheck --prefix frontend`
- `npm.cmd test --prefix frontend` - 72 pass, 0 fail
- `npm.cmd run build --prefix frontend`
- `npm.cmd run build`
- `npm.cmd run smoke:core-research --prefix backend`
- `npm.cmd run smoke:search-providers --prefix backend`
- `npm.cmd run smoke:source-usage --prefix backend`
- `npm.cmd run smoke:provider-fallback --prefix backend`
- `npm.cmd run smoke:visible-research-output --prefix backend`
- `npm.cmd run smoke:providers --prefix backend`
- `npm.cmd run smoke:provider-refresh --prefix backend`
- `npm.cmd run smoke:provider-route-semantics --prefix backend`

Remaining live risk: browser-side Save-only-Groq and live fast research were not executed because no live provider/search keys are configured in this workspace. Provider/search smokes reported missing keys without fake success.

## Evidence-First ClaimLedger + ModelPlan Addendum - 2026-05-26

This addendum records the bounded implementation pass for the zero-loss prompt. It does not claim every appendix item is fully closed. It closes the highest-risk architectural gaps touched in this pass and documents the remaining work honestly.

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/core/evidence/claim-ledger.ts` | research_pipeline, production_core | Converts validated SourceUsageMap output into citation-credit-aware claim items with evidence spans | Built by core generation and final prompt construction | `core-answer-generator.ts`, `core-answer-prompt.ts`, synthesis orchestrator | SourceUsageMap outputs were validation-only and did not feed synthesis | ClaimGraph remains separate but now complements the ledger | Critical | Added ClaimLedger builder, snippet/title-only downgrade, generic-claim item discard, and prompt formatter |
| `backend/src/core/synthesis/synthesis-orchestrator.ts` | research_pipeline, production_core | Real division synthesis coordinator over `DIVISION_REGISTRY` | Core answer result division outputs | `core-answer-generator.ts`, tests | File was a dead re-export, so D1-D11 registry instructions were not used in production synthesis | Legacy deterministic section builder still exists as fallback text renderer | Critical | Replaced dead re-export with orchestrator that calls registry instructions, orders D7 after D1-D6/D8-D10, and D11 last |
| `backend/src/core/generation/core-answer-generator.ts` | research_pipeline, provider_runtime | Final answer generation, validation, deterministic fallback | Core pipeline generation phase | Pipeline, prompt builder, validators | Deterministic thesis had hardcoded democracy-space framing and did not consume ClaimLedger | Old deterministic section body remains but now uses agenda-framed thesis | Critical | Builds ClaimLedger before final answer, passes it into synthesis/prompt, calls division orchestrator, and replaced hardcoded thesis with agenda-driven Indian parliamentary framing |
| `backend/src/core/generation/core-answer-prompt.ts` | research_pipeline | Final prompt construction | Model-backed final prose generation | Core answer generator | Prompt included registry/packs but not SourceUsageMap-derived claims | Evidence packs still provide source-card context | High | Adds formatted ClaimLedger to normal and budgeted prompts so synthesis sees extracted claims and evidence spans |
| `backend/src/core/providers/model-strategy.ts` | provider_runtime, research_pipeline | Provider/model strategy and role model plan | Pipeline model-plan validation and source-usage role assignment | Research pipeline, provider tests | Multi-model selection collapsed into one primary model; catalog fallback could look executable | Existing fallback candidate selector remains for older callers | Critical | Added typed `ResearchModelPlan`, role assignments, first-slash model parsing, catalog-only generation blocking, and explicit fallback warnings |
| `backend/src/core/pipeline/research-pipeline.ts` | research_pipeline | Official retrieval/source-usage/generation pipeline | All core research modes | Anthropic service route | Source-usage roles and final prose used one provider/model instead of a role plan | Legacy fallback remains explicit degraded adapter only | Critical | Builds/emits `model_plan_validated`, passes per-role assignments into SourceUsageMap generation, and uses final-prose assignment for final generation |
| `backend/src/core/pipeline/pipeline-events.ts` | backend_runtime | Typed pipeline event names | Backend SSE events | Research pipeline, frontend SSE envelope | Missing typed event for model-plan validation | None | Medium | Added `model_plan_validated` event type |
| `backend/src/services/anthropic-service.ts` | backend_runtime, research_pipeline | Main chat/research route | Core research request path | Frontend stream request | `webModels` were parsed but only first model reached core execution | Legacy multi-search path remains explicit only | Critical | Passes full `effectiveWebModels` into the core research pipeline as `userSelectedModels` |
| `backend/tests/evidence/claim-ledger.test.ts` | test_only | ClaimLedger unit coverage | Local backend tests | ClaimLedger implementation | No tests for SourceUsageMap-to-synthesis handoff | None | Medium | Covers evidence-span construction, snippet-only downgrade, and generic claim discard |
| `backend/tests/synthesis/synthesis-orchestrator.test.ts` | test_only | Division orchestrator coverage | Local backend tests | Synthesis orchestrator | No test that `DIVISION_REGISTRY.generateInstructions()` is called | None | Medium | Covers registry instruction use and D7/D11 ordering |
| `backend/tests/providers/model-plan.test.ts` | test_only | ResearchModelPlan coverage | Local backend tests | Model strategy | No test for five selected role models or catalog fallback blocking | None | Medium | Covers five explicit selected models, nested org model IDs, and catalog-only non-executability |
| `backend/tests/generation/core-answer-generator-model-path.test.ts` | test_only | Core generation regression coverage | Local backend tests | Core answer generator | No test preventing unrelated agendas from receiving democracy-space thesis | None | Medium | Added agenda-framing regression for GST/fiscal federalism |

Implementation notes:

Problem: SourceUsageMap extraction results were validated but not used as synthesis input.
Root cause: Final prompts consumed evidence packs and registry cards, while extracted claims/legal holdings/numbers remained side-channel validation data.
Files changed: `backend/src/core/evidence/claim-ledger.ts`, `backend/src/core/generation/core-answer-generator.ts`, `backend/src/core/generation/core-answer-prompt.ts`.
Fix: Build a ClaimLedger from ModelRoleOutput and EvidenceRegistry, require evidence spans for citation credit, downgrade snippet/title-only claims, discard repeated generic claims item-by-item, and feed the formatted ledger into final prompts.
Runtime reasoning: The actual core generation path now receives source-usage-derived claims before prose rendering, so validated evidence use is no longer only post-hoc validation.
Verification: `node --import tsx --test tests/evidence/claim-ledger.test.ts tests/generation/core-answer-generator-model-path.test.ts`.
Remaining risk: ClaimGraph contradiction resolution is still shallow and should be strengthened in a later pass.

Problem: `synthesis-orchestrator.ts` did not orchestrate synthesis.
Root cause: The file re-exported the pipeline and never called `DIVISION_REGISTRY`.
Files changed: `backend/src/core/synthesis/synthesis-orchestrator.ts`, `backend/src/core/generation/core-answer-generator.ts`, `backend/tests/synthesis/synthesis-orchestrator.test.ts`.
Fix: Added `runDivisionSynthesisOrchestrator()` that filters active divisions, calls `division.generateInstructions()`, renders ClaimLedger-backed division content, generates D7 after finding divisions, and generates D11 last.
Runtime reasoning: Core answer results now expose division outputs from the official registry path instead of a dead re-export.
Verification: `node --import tsx --test tests/synthesis/synthesis-orchestrator.test.ts`.
Remaining risk: The orchestrator is deterministic; model-backed per-division prose rendering remains future work.

Problem: User-selected multi-model lists collapsed into one provider/model in the core path.
Root cause: The route selected `effectiveWebModels[0]`, and source-usage roles reused `input.providerName/input.model`.
Files changed: `backend/src/core/providers/model-strategy.ts`, `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/services/anthropic-service.ts`, `backend/src/core/pipeline/pipeline-events.ts`.
Fix: Added `ResearchModelPlan`, pass `webModels` as `userSelectedModels`, emit `model_plan_validated`, map five selected models to role assignments, block catalog-only providers from generation eligibility, and use role-specific assignments for SourceUsageMap roles and final prose generation.
Runtime reasoning: The real research route can now carry explicit multi-model user intent into role execution instead of silently collapsing it to one primary model.
Verification: `node --import tsx --test tests/providers/model-plan.test.ts tests/providers/model-strategy-autofallback.test.ts tests/pipeline/research-terminal-events.test.ts`; backend typecheck passes.
Remaining risk: Live provider preflight statuses are not yet fetched inside the message route before plan creation; when statuses are absent, the plan remains permissive and provider calls still enforce actual key/model errors.

Problem: Deterministic fallback answer hardcoded democracy-space framing for unrelated agendas.
Root cause: `buildAnswerText()` had a fixed thesis about India's democratic space, democracy indices, and democratic decline.
Files changed: `backend/src/core/generation/core-answer-generator.ts`, `backend/tests/generation/core-answer-generator-model-path.test.ts`.
Fix: Build the thesis from `agendaContract.normalizedAgenda`, temporal scope, bucket coverage, ClaimLedger/evidence summaries, and Indian parliamentary debate roles.
Runtime reasoning: Deterministic fallback no longer tells an AIPPM GST/fiscal federalism user that the core issue is democratic-space decline.
Verification: The GST/fiscal federalism regression passes and asserts no democracy-space/democracy-indices thesis appears.
Remaining risk: Some lower sections still use generic parliamentary phrasing and should eventually be generated from division claim plans rather than templates.

Verification for this addendum:

- `node --import tsx --test tests/evidence/claim-ledger.test.ts tests/synthesis/synthesis-orchestrator.test.ts tests/providers/model-plan.test.ts tests/generation/core-answer-generator-model-path.test.ts tests/evidence/evidence-compressor.test.ts` - 14 passed, 0 failed
- `node --import tsx --test tests/pipeline/research-terminal-events.test.ts` - 1 passed, 0 failed
- `npm.cmd run typecheck --prefix backend` - pass
- `npm.cmd test --prefix backend` - 497 tests, 492 passed, 5 live-key-gated skipped, 0 failed
- `npm.cmd run build` - pass with the existing frontend large chunk warning

## Brick 12 Source Enrichment Layer Modularization - 2026-05-27

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/core/retrieval/source-enrichment.ts` | research_pipeline | Backward-compatible enrichment entrypoint | Imported by bucketed retrieval and legacy tests | `bucketed-retrieval.ts`, retrieval tests | Monolithic raw-text enrichment, permanent failed-cache risk | Duplicated readability/Jina extraction helpers | Critical | Replaced with a shim that re-exports `enrichment/index.ts`. |
| `backend/src/core/retrieval/enrichment/enrich-source.ts` | research_pipeline | Brick 12 orchestrator | `enrichSource`, `enrichSources`, `enrichSourcesConcurrent` | `source-enrichment.ts` shim | New modular path must preserve old call contract | None | Critical | Added extraction -> clean -> chunk -> score -> card -> validate -> cache flow. |
| `backend/src/core/retrieval/enrichment/clean-text.ts` | research_pipeline | Local article cleanup | Called before chunking/scoring | Enrichment orchestrator and tests | Boilerplate could dominate extracted text | None | High | Strips common boilerplate and reports density/word statistics. |
| `backend/src/core/retrieval/enrichment/chunk-source.ts` | research_pipeline | Query-era source chunking | Called before relevance scoring | Enrichment orchestrator and tests | Raw article text previously passed through whole | Synthesis chunker remains downstream-only | High | Adds semantic 80-600 char chunks with source URL/index metadata. |
| `backend/src/core/retrieval/enrichment/local-relevance-scorer.ts` | research_pipeline | Local chunk scoring | Called before card construction | Enrichment orchestrator and tests | Citation eligibility was not query-aware | None | High | Adds query-term scoring, Indian/legal/numeric bonuses, and boilerplate penalties. |
| `backend/src/core/retrieval/enrichment/evidence-card-builder.ts` | research_pipeline | Enrichment evidence card construction | Produces optional `EnrichedSource.enrichmentCard` | Local/Cerebras reducers | No enrichment-time structured evidence existed | Downstream compressor still remains out of scope | High | Builds bounded evidence cards from verified top chunks. |
| `backend/src/core/retrieval/enrichment/evidence-card-validator.ts` | research_pipeline | Local card verification | Validates reducer/card snippets against source chunks | Orchestrator, reducers, tests | Unverified model snippets could be accepted | None | Critical | Drops top chunks/evidence items that cannot be verified from source text. |
| `backend/src/core/retrieval/enrichment/source-quality.ts` | research_pipeline | Quality and citation policy | Sets card/source citation flags | Orchestrator, card builder | Snippet/low-quality sources could look too strong | None | Critical | Adds limited-source and citation-strength decisions without weakening SourceUsageMap. |
| `backend/src/core/retrieval/enrichment/enrichment-cache.ts` | research_pipeline | Enrichment cache policy | Writes through existing `CacheManager` | Orchestrator and tests | Failed/snippet fallback could poison cache | None | Critical | Skips failed writes; uses 10 min snippet and 15 min partial TTLs. |
| `backend/src/core/retrieval/enrichment/backup-source-selector.ts` | research_pipeline | Failed-source replacement selector | Multi-source enrichment only | Orchestrator and tests | Failed high-rank source had no same-bucket substitute | None | Medium | Selects one unprocessed backup by score/authority and bucket overlap. |
| `backend/src/core/retrieval/enrichment/extractors/*` | research_pipeline | Readability/Jina/PDF extraction modules | Called by enrichment orchestrator | Orchestrator and provider wrappers | Extractor logic was embedded or duplicated | Search extractor providers remain canonical provider clients | High | Moved readability logic, added Jina wrapper, added graceful PDF extractor. |
| `backend/src/core/retrieval/enrichment/reducers/*` | research_pipeline | Evidence-card reducers | Local default; optional Cerebras accelerator | Orchestrator and tests | No card reducer boundary existed | None | Medium | Adds deterministic local reducer and chunk-only Cerebras reducer with local fallback. |
| `backend/src/core/retrieval/enrichment/telemetry.ts` | backend_runtime, research_pipeline | Enrichment telemetry wrapper | Emits enrichment-level events | Orchestrator/cache/reducers | No Brick 12 event visibility | Existing telemetry singleton | Medium | Emits extraction, quality, cache, validation, backup, and Cerebras events. |
| `backend/tests/retrieval/enrichment/*.test.ts` | test_only | Brick 12 module coverage | Local backend test suite | New enrichment modules | No direct modular enrichment tests | Existing shim tests remain | Medium | Added coverage for cleanup, chunking, scoring, cards, cache, backup, Cerebras, integration. |

Problem: Brick 12 passed oversized raw extracted text downstream and mixed extraction, cleanup, scoring, cache policy, and fallback behavior in one file.
Root cause: `source-enrichment.ts` built `EnrichedSource.fullText` directly from extractor/readability/snippet text, used only broad extraction-quality heuristics for citation eligibility, and cached fallback results using the same freshness path as successful extraction.
Files changed: `backend/src/core/retrieval/source-enrichment.ts`, `backend/src/core/retrieval/enrichment/**`, `backend/tests/retrieval/enrichment/**`, `docs/backend-overhaul/FULL_REPO_BUG_AUDIT.md`.
Fix: Split Brick 12 into focused modules, route every extraction through local cleanup, semantic chunking, local relevance scoring, evidence-card construction, local validation, citation-strength policy, and failure-aware cache writes.
Runtime reasoning: Existing callers still import the shim, but the actual enrichment result now carries only top-scored chunk text in `fullText`, optional validated `enrichmentCard` metadata, and honest low/limited/ineligible citation state for weak or failed sources.
Verification: Targeted Brick 12 command passed: `node --import tsx --test --test-concurrency=1 tests/retrieval/enrichment/*.test.ts tests/retrieval/source-enrichment-concurrency.test.ts tests/retrieval/extraction-fallback-flow.test.ts tests/retrieval/enrichment-budget-abort.test.ts` - 29 passed, 0 failed. Full backend tests passed: `npm.cmd test` - 519 tests, 514 passed, 5 skipped, 0 failed. Backend typecheck passed: `npx.cmd tsc --noEmit`. Backend build passed: `npm.cmd run build`.
Remaining risk: `pdfjs-dist` is not installed, so PDF extraction currently fails gracefully unless that optional package is added later; downstream `evidence-compressor.ts` is intentionally untouched in this Brick 12 pass.

## Brick 13 EvidenceRegistry Repair - 2026-05-27

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/core/evidence/evidence-registry.ts` | research_pipeline, production_core | Official core evidence registry API | Core research pipeline, source usage, citation validation, final generation | Pipeline, verification, generation, tests | Duplicate canonical URLs discarded better enrichment; prompt export unbounded | Legacy `lib/evidence-registry.ts` still exists | Critical | Rebuilt around merge-on-duplicate, citation-strength tiers, top chunk/card getters, stricter claim matching, and prompt budget guard. |
| `backend/src/core/evidence/evidence-registry-types.ts` | production_core | Shared core evidence source types | Imported by registry/deduper/ranking/cards | Core evidence modules | Brick 12 enrichment metadata had no registry schema | None | Critical | Added `TopChunk`, `EnrichmentCard`, `CitationStrength`, `limitedSource`, and preserved legacy-compatible input typing. |
| `backend/src/core/evidence/source-normalizer.ts` | research_pipeline, production_core | Raw source to registry input normalization | `buildEvidenceRegistryFromSources()` | Registry and legacy bridge | Excerpt-only sources were inferred as `full`; Brick 12 fields were dropped | Legacy registry has separate source schema | Critical | Fixed extraction quality inference, preserves enrichment cards/top chunks, applies 65 authority threshold, and computes limited-source state. |
| `backend/src/core/evidence/source-deduper.ts` | production_core | Safe canonical duplicate merge | `EvidenceRegistryCore.addSource()` | Registry and tests | Better incoming full text/enrichment was silently dropped | Retrieval deduper remains separate | Critical | Merges best full text, authority, quality, facts, chunks, limitations, buckets, provenance, and incoming enrichment cards with stable IDs. |
| `backend/src/core/evidence/citation-strength-filter.ts` | production_core | Registry citation tier policy | Registry normalization and merge | Evidence cards, compressor, ranking | Citation strength was recomputed inconsistently downstream | None | High | Centralized strong/medium/weak/ineligible rules from citation eligibility, authority, class, extraction quality, and title-only facts. |
| `backend/src/core/evidence/evidence-card-store.ts` | research_pipeline, production_core | EvidenceCard construction | Evidence pack builder | Source usage roles and synthesis cards | Cards lacked strength, chunks, limited-source, and extraction-quality metadata | Compressor still has its own compact card type | High | Builds cards with registry-backed citation strength, top chunks, limited source, and extraction quality. |
| `backend/src/core/evidence/evidence-ranking.ts` | production_core | Tiered registry source ordering | Prompt selection helpers and tests | Future Brick 16/17 consumers | Strong/medium/weak sources were not exposed separately | None | Medium | Added ranked strong/medium/weak/ineligible groupings and top-N prompt selection excluding ineligible sources. |
| `backend/src/core/evidence/evidence-trace.ts` | production_core | Claim to chunk/source trace API | ClaimLedger and tests | Source usage/citation trace consumers | Trace lookup was buried inside ClaimLedger and ignored Brick 12 chunks | ClaimLedger keeps local span formatting | High | Added chunk-first trace construction with fullText/snippet fallback. |
| `backend/src/core/evidence/registry-integrity.ts` | production_core | Pre-storage registry validation | `EvidenceRegistryCore.addSource()` | Registry | Missing title/url/canonical and failed eligible sources were not flagged at storage boundary | None | Medium | Validates required identity fields and demotes invalid storage inputs rather than letting them remain citation-eligible. |
| `backend/src/core/evidence/evidence-pack-builder.ts` | research_pipeline | Evidence pack assembly | Core pipeline model role packs | Synthesis/model role runner | Pack cards did not surface Brick 13 strength/chunk metadata | None | High | Delegates card construction to `evidence-card-store.ts` while preserving old pack API. |
| `backend/src/core/evidence/evidence-compressor.ts` | research_pipeline | Budgeted compact evidence cards | Final prompt budget path | Core answer prompt/generator tests | Recomputed citation strength and ignored registry top chunks | EvidenceCard store remains full-card path | High | Reads registry citation strength, includes top chunks/limitedSource, and ranks snippets from stored top chunks first. |
| `backend/src/core/evidence/claim-ledger.ts` | research_pipeline | SourceUsageMap to evidence span ledger | Core generation and prompt construction | Core answer generator/prompt | Evidence spans ignored registry top chunks | `evidence-trace.ts` now provides shared trace logic | Medium | Uses chunk-first matching before legacy keyFact/fullText/snippet span search. |
| `backend/src/lib/evidence-cache.ts` | legacy_fallback_only | Legacy registry cache | Anthropic legacy evidence path | Anthropic service | Cache key did not distinguish enrichment versions | Core registry does not use this cache | Medium | Added optional `enrichmentVersion` key segment while preserving default caller behavior. |
| `backend/src/lib/evidence-registry.ts` | legacy_fallback_only | Legacy passage/tier registry | Legacy anthropic-service path and legacy tests | Legacy evidence blocks | Split-brain legacy registry bypassed core registry | Core EvidenceRegistry is official path | High | Added `BRICK-13-LEGACY` marker and non-enumerable core registry bridge for migration visibility. |
| `backend/tests/evidence/evidence-card-preservation.test.ts` | test_only | Registry preservation regression tests | Local backend tests | Core registry | No coverage for enrichment card/chunk preservation | None | Medium | Covers addSource preservation, duplicate merge, topChunks, and strength recomputation. |
| `backend/tests/evidence/source-deduper.test.ts` | test_only | Duplicate merge unit tests | Local backend tests | Evidence deduper | No safe-merge coverage | None | Medium | Covers best fullText, authority, quality, chunks, and enrichmentCard preservation. |
| `backend/tests/evidence/citation-strength-filter.test.ts` | test_only | Citation tier policy tests | Local backend tests | Citation filter | No dedicated strength rule tests | None | Medium | Covers strong primary sources, weak snippets/title-only/low-authority, and failed/ineligible sources. |
| `backend/tests/evidence/evidence-trace.test.ts` | test_only | Claim trace tests | Local backend tests | Evidence trace | No chunk-first trace coverage | None | Medium | Covers top chunk match, fullText fallback, and missing source handling. |
| `backend/tests/evidence/registry-integration.test.ts` | test_only | Registry/cache/legacy integration tests | Local backend tests | Core registry, legacy registry, cache | No budget/cache version/legacy bridge coverage | None | Medium | Covers prompt budget, tier ranking, cache version separation, and legacy core bridge. |

Problem: Brick 12 enrichment cards, top chunks, citation strength, and limited-source state could not survive registry ingestion.
Root cause: `EvidenceSource` had no fields for enrichment artifacts, `buildEvidenceRegistryFromSources()` normalized only legacy text fields, and duplicate canonical URLs returned the existing source without merging better incoming evidence.
Files changed: `backend/src/core/evidence/evidence-registry.ts`, `backend/src/core/evidence/evidence-registry-types.ts`, `backend/src/core/evidence/source-normalizer.ts`, `backend/src/core/evidence/source-deduper.ts`, `backend/src/core/evidence/citation-strength-filter.ts`, `backend/src/core/evidence/evidence-card-store.ts`, `backend/src/core/evidence/evidence-ranking.ts`, `backend/src/core/evidence/evidence-trace.ts`, `backend/src/core/evidence/registry-integrity.ts`, `backend/src/core/evidence/evidence-pack-builder.ts`, `backend/src/core/evidence/evidence-compressor.ts`, `backend/src/core/evidence/claim-ledger.ts`, `backend/src/lib/evidence-cache.ts`, `backend/src/lib/evidence-registry.ts`, and `backend/tests/evidence/*.test.ts`.
Fix: Extended the registry schema, centralized source normalization and citation-strength computation, merged duplicate sources by best evidence instead of discarding, preserved top chunks and enrichment cards, exposed tier/chunk/card getters, and bounded prompt export.
Runtime reasoning: The official core registry can now carry Brick 12 source-level evidence into cards, compression, claim ledger spans, and later source usage/citation stages without re-crawling or fabricating evidence. Existing imports from `evidence-registry.ts` continue to resolve.
Verification: Targeted command passed: `node --import tsx --test --test-concurrency=1 tests/evidence/*.test.ts tests/verification/*citation*.test.ts` - 87 passed, 0 failed. Full backend tests passed: `npm.cmd test` - 535 tests, 530 passed, 5 skipped, 0 failed. Backend typecheck passed: `npx.cmd tsc --noEmit`. Backend build passed: `npm.cmd run build`.
Remaining risk: `bucketed-retrieval.ts` and `research-pipeline.ts` still do not forward all Brick 12 optional fields into the raw evidence input, by scope constraint; this repair preserves those fields whenever they reach `buildEvidenceRegistryFromSources()`. The legacy `lib/evidence-registry.ts` path is bridged and marked but not migrated away.

## Brick 16 SourceUsageMap Validator Modular Repair - 2026-05-27

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/core/evidence/source-usage-map.ts` | research_pipeline | Backward-compatible SourceUsageMap entrypoint | Imported by model role runner, pipeline, generation, ClaimLedger, and tests | Core generation, synthesis, pipeline | Monolithic validator mixed types, deterministic extraction, and aggregate rules | New modular `source-usage/**` is canonical | Critical | Replaced with a shim re-exporting `source-usage/index.ts`. |
| `backend/src/core/evidence/source-usage/types.ts` | research_pipeline | SourceUsageMap public contracts | All SourceUsageMap modules | Shim and consumers | No structured failures, strength counts, rejected IDs, or span metadata | None | Critical | Added optional structured validation fields while preserving old exports. |
| `backend/src/core/evidence/source-usage/validate-source-usage-map.ts` | research_pipeline | Main source usage validator | Per-role and aggregate source usage checks | Model role runner, core generator, pipeline wrapper | Fake/cross-batch IDs, ungrounded claims, and weak/snippet sources could count | None | Critical | Grounds claims against registry evidence, enforces scope, separates weak/snippet counts, and returns approved IDs only. |
| `backend/src/core/evidence/source-usage/claim-grounding.ts` | research_pipeline | Usage item claim grounding | Called by validator | Evidence span matcher | Non-empty invented claims could pass | ClaimLedger has downstream span checks | Critical | Requires evidence span or at least three meaningful shared tokens. |
| `backend/src/core/evidence/source-usage/evidence-span-matcher.ts` | research_pipeline | Chunk/text span matching | Validator and tests | Registry top chunks/full text/snippets | Single-word overlap could validate claims | EvidenceRegistry claim matcher remains separate | High | Adds chunk-first matching, boilerplate rejection, and numeric exact-match support. |
| `backend/src/core/evidence/source-usage/source-eligibility.ts` | research_pipeline | Citation-strength count policy | Validator | EvidenceRegistry citation strength fields | Weak/snippet/title-only sources could satisfy strict minima | None | Critical | Counts only strong/medium or legacy partial full-text evidence; snippet/failed/title-only remain rejected or context-only. |
| `backend/src/core/evidence/source-usage/deterministic-map-builder.ts` | research_pipeline | Deterministic usage item builder | Model role deterministic mode and registry fallback | Model role runner, shim | Title-only and boilerplate cards could become high-confidence facts; supportedSection was fabricated | None | High | Demotes weak/title-only cards and derives claims from evidence text without role-name hardcoding. |
| `backend/src/core/evidence/source-usage/aggregate-source-usage.ts` | research_pipeline | Aggregate/per-role validator | Pipeline aggregate wrapper and core generator | `research-pipeline.ts`, `core-answer-generator.ts` | Union-only aggregate could hide failed roles | Pipeline wrapper remains for old imports | High | Adds per-role validation and mode-aware role pass requirements. |
| `backend/src/core/evidence/source-usage/role-source-scope.ts` | research_pipeline | Allowed-source scope checks | Validator | Model role batch validation | Cross-batch source references could count | None | Critical | Rejects real but unassigned source IDs as `cross_batch_reference`. |
| `backend/src/core/evidence/source-usage/failure-reporting.ts` | research_pipeline | Structured failure helpers | Validator and failure reports | Model role runner | Giant semicolon strings were the only failure format | String failures preserved for compatibility | Medium | Adds typed structured failures with severity, role, source, usage type, and detail. |
| `backend/src/core/evidence/source-usage/source-usage-normalizer.ts` | research_pipeline | Model JSON usage normalization | Model role runner | Provider JSON responses | Normalization lived in synthesis runner | None | Medium | Moves JSON-to-usage item normalization behind a reusable module. |
| `backend/src/core/evidence/source-usage/claim-ledger-integration.ts` | research_pipeline | Validator-approved handoff helpers | Model role runner and tests | ClaimLedger handoff | Raw rejected IDs/items could leak downstream | ClaimLedger still performs independent span validation | High | Syncs role outputs to approved IDs and filters sourceUsageMap items for validated handoff. |
| `backend/src/core/evidence/source-usage/batch-coverage.ts` | research_pipeline | Balanced source selection helper | Registry fallback usage map | SourceUsageMap builder | Selection logic was embedded in monolith | Evidence pack balancing remains separate | Low | Moves balanced source selection into the module folder. |
| `backend/src/core/evidence/source-usage/telemetry.ts` | backend_runtime, research_pipeline | Source usage telemetry wrapper | Available to validator modules | Existing telemetry singleton | No source-usage event helper | None | Low | Adds safe `source_usage.*` event helper. |
| `backend/src/core/synthesis/model-role-runner.ts` | research_pipeline | Source usage role execution | Generates model/deterministic SourceUsageMap outputs | Pipeline | Batch validation did not pass explicit allowed IDs; deterministic fallback could fabricate weak facts | Source usage modules now own normalization/deterministic building | Critical | Uses modular normalizer/builder, validates batch scope, and returns validator-approved IDs. |
| `backend/src/core/generation/core-answer-generator.ts` | research_pipeline | Final answer source usage aggregate validation | Core answer generation | Pipeline | Aggregate validation was union-oriented | Pipeline wrapper remains | High | Consumes modular aggregate validation and exposes approved IDs/counts in the report. |
| `backend/src/core/pipeline/research-pipeline.ts` | research_pipeline | Pipeline aggregate wrapper and retrieval evidence handoff | Core research modes | Anthropic service route | Wrapper used union aggregate; retrieval snippets could become boilerplate facts | Pipeline remains orchestration layer | High | Delegates aggregate validation to Brick 16 module and filters obvious boilerplate facts at retrieval handoff. |
| `backend/tests/evidence/source-usage/*.test.ts` | test_only | Brick 16 modular coverage | Local backend tests | New source usage modules | No direct tests for grounding/scope/strength/structured failures | Existing shim tests remain | Medium | Added tests for claim grounding, cross-batch rejection, strength counts, deterministic demotion, per-role aggregate, span matching, ID sync, failures, and integration. |

Problem: Brick 16 could count a source as used when the role merely listed a source ID, returned a non-empty but invented claim, referenced a source outside its assigned batch, or relied on weak/snippet/title-only evidence.
Root cause: `source-usage-map.ts` mixed validation and deterministic construction in one file, checked field presence more than evidence grounding, had no structured failure model, and aggregate validation could treat a union of source IDs as success even when individual roles failed.
Files changed: `backend/src/core/evidence/source-usage-map.ts`, `backend/src/core/evidence/source-usage/**`, `backend/src/core/synthesis/model-role-runner.ts`, `backend/src/core/generation/core-answer-generator.ts`, `backend/src/core/pipeline/research-pipeline.ts`, `backend/tests/evidence/source-usage/**`, `backend/tests/evidence/source-usage-real-role.test.ts`, and `docs/backend-overhaul/FULL_REPO_BUG_AUDIT.md`.
Fix: Modularized the validator, grounded claim-bearing fields against registry text/top chunks, enforced allowed source scopes, separated strong/medium/weak/snippet counts, demoted weak deterministic evidence, removed role-name-based supported section fabrication, synced approved source IDs into role outputs, and added structured failures.
Runtime reasoning: Source usage roles now only credit sources that were assigned to that role and whose extracted claim/number/legal holding can be verified from `EvidenceRegistry` evidence. Weak/snippet sources may remain contextual, but strict source minima use validator-approved strong/medium evidence only.
Verification: Targeted Brick 16 command passed: `node --import tsx --test --test-concurrency=1 tests/evidence/source-usage/*.test.ts tests/evidence/source-usage-*.test.ts tests/integration/source-usage-role-retry.test.ts tests/pipeline/source-usage-invalid-output-retry-limit.test.ts` - 49 passed, 0 failed. Additional source-usage pipeline regressions passed: `node --import tsx --test --test-concurrency=1 tests/generation/core-answer-generator.test.ts tests/integration/india-democracy-pipeline.integration.test.ts tests/integration/live-core-pipeline-routing.test.ts` - 6 passed, 0 failed. Backend build passed: `npm.cmd run build`.
Remaining risk: Full backend test run is not green in the current dirty checkout: `npm.cmd test` reported 551 passed, 5 skipped, 13 failed, mostly prompt-budget/model-generation regressions plus one retrieval bucket test outside this Brick 16 patch. `npx.cmd tsc --noEmit` currently fails on unrelated `src/lib/query-planner.ts` missing `PlannedQueries`. Brick 16 targeted validation is green, but the broader workspace still has pre-existing/out-of-scope failures to resolve separately.
# Retrieval Cache Rebuild Classification

| File | Classification | Purpose | Runtime usage | Known bugs | Duplicate systems | Risk level | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `backend/src/core/retrieval-cache/*` | research_pipeline | L1 retrieval cache wrappers over `CacheManager` | Search, enrichment, provider cooldown, dedupe, evidence-card paths when enabled | L1 only; no global LRU | Reuses older `enrichment-cache.ts`; not a second store | Medium | Rebuilt removed cache modules |
| `backend/src/services/cache-manager.ts` | production_core | Shared in-memory cache and reuse gates | Used by enrichment and retrieval cache wrappers | No persisted backend | None | Medium | Added retrieval namespaces and entry/delete helpers |
| `backend/src/core/retrieval/search-executor.ts` | research_pipeline | Executes bucketed live search | Core web/fast/deep retrieval | Removed retrieval cache wrapper caused repeated search calls | Legacy direct search namespace cache retained | Medium | Restored retrieval-cache search wrapper while preserving old cache hook |
| `backend/src/core/retrieval/enrichment/enrich-source.ts` | research_pipeline | Extracts and builds enriched source cards | Source enrichment stage | Removed negative cache caused repeat failed extraction attempts | Existing enrichment cache remains | High | Restored URL extraction cache and negative writes |
| `backend/src/core/providers/limits/extraction-cooldown.ts` | provider_runtime | Per-run Jina/Firecrawl cooldown state | Extractor fallback routing | State was per-run only | None | Medium | Hydrated and persisted through provider health cache |
| `frontend/src/components/chat/research-pipeline/RetrievalCachePanel.tsx` | frontend_runtime | Cache diagnostics card | Guarded Research Pipeline panel | Removed panel hid cache behavior | None | Low | Rebuilt panel using existing core event stream |
