# Phase 2 Core Research Pipeline Diagnosis

Date: 2026-05-21

## Scope

Phase 2 targets the core research engine only: SourceUsageMap validation, core generation, citation validation, source contract semantics, final status, archive safety, and frontend status sync. Provider dropdown/model-refresh work is Phase 1 and is not changed here except for one blocking provider-status redaction regression that prevents the required backend test suite from passing.

## Current Runtime Trace

The active code path for research modes is:

1. Frontend sends a research chat payload with `mode` / effective research mode and selected model IDs.
2. `backend/src/services/anthropic-service.ts` detects research modes and uses the core research route when `USE_CORE_RESEARCH_ROUTE !== "false"` and `USE_LEGACY_RESEARCH_ROUTE !== "true"`.
3. `buildCoreProviderRouter()` resolves the selected provider/model and passes `providerRouter`, `providerName`, and native model ID into `runResearchPipeline()`.
4. `runResearchPipeline()` builds an `AgendaContract`, query plan, live retrieval, filtered sources, `EvidenceRegistry`, `EvidencePacks`, `ClaimGraph`, SourceUsageMap role outputs, core answer, citation report, quality gate, and final answer.
5. `anthropic-service.ts` evaluates `sourceContract`, emits `citation_status`, `source_contract`, and `quality_gate`, then calls `decideFinalResearchStatus()`.
6. Failed/provider-error terminal statuses persist a failure message with hidden pipeline metadata and return without archive merge.
7. Non-failed terminal statuses stream the answer, persist hidden metadata, and call `canMergeResearchAnswerIntoArchive()` before archive merge.

## Prompt A

Prompt:

`Analyze the 2026 India parliamentary issue in Indian Mock Parliament style with Treasury Bench arguments, Opposition arguments, POIs, rebuttals, and sources.`

| Mode | Backend route | researchMode | Core route | Legacy fallback | Query quality | Source policy | Expected terminal semantics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fast/Web | `/api/anthropic/messages` streaming path | `fast_research` / `web_search` policy | Yes, unless disabled by env | Disabled unless explicit fallback/test compatibility | Topic extraction must avoid generic duplicated-year queries; current planner removes duplicate years and injects non-stopword topic keywords | 10 required, 3 minimum, non-strict | `completed` only on strict pass; otherwise honest `completed_with_source_gaps` or `failed` |
| Deep | same | `deep_research` | Yes | Disabled unless explicit fallback/test compatibility | Uses deeper bucket plan; if generic prompt has weak topic, source gaps must be visible | 20 required, 8 minimum, non-strict | Can return `completed_with_source_gaps` only with SourceGapReport and citations |
| PhD | same | `phd_level` | Yes | Legacy fallback is failure | Strict source usage and citation proof | 30 required, 20 minimum, strict | Fails honestly if proof is insufficient |
| FullSpectrum | same | `fullspectrum` | Yes | Legacy fallback is failure | Broadest bucketed plan | 30 required, 25 minimum, strict | Fails honestly if proof is insufficient |

## Prompt B

Prompt:

`Analyze India’s declining democratic space from 2022–2025 using Freedom House, V-Dem, EIU, UAPA, FCRA, internet shutdowns, HRW, Amnesty, CIVICUS, Supreme Court responses, EVM/VVPAT allegations, electoral bonds, RSF, EPW, MHA, ECI, The Hindu, and Indian Express. Make it Indian Mock Parliament-ready with research angles, Treasury Bench arguments, Opposition arguments, POIs, rebuttals, and resolution clauses.`

| Mode | Backend route | researchMode | Core route | Query count / quality | Bucket coverage target | Expected terminal semantics |
| --- | --- | --- | --- | --- | --- | --- |
| Fast/Web | `/api/anthropic/messages` streaming path | `fast_research` / `web_search` policy | Yes | Lighter bucketed plan; no PhD 30-source proof | Major cited buckets only | `completed_with_source_gaps` allowed when useful but incomplete |
| Deep | same | `deep_research` | Yes | Democratic-space topic triggers broad query/bucket strategy | democracy index, watchdog, civic space, press freedom, digital rights, electoral integrity, official, legal, academic, Indian media | Partial allowed only with SourceGapReport |
| PhD | same | `phd_level` | Yes | 60+ unique democratic-space queries in existing planner regression tests | strict 30+ proof when available | strict failure when proof cannot be validated |
| FullSpectrum | same | `fullspectrum` | Yes | 80+ unique democratic-space queries in existing planner regression tests | strictest broad coverage | strict failure when proof cannot be validated |

## SourceUsageMap

`validateSourceUsageMap()` is currently strict. It rejects listing-only usage, fake source IDs, missing extraction/support fields, weak-only usage, repeated generic claims, legal holdings from non-legal sources, and insufficient valid unique usage. `relevant_but_weak` does not count toward strict source usage.

`runModelRoleForSourceUsage()` currently:

- sends source usage batches to a configured healthy provider,
- validates batch semantics,
- retries invalid batches with a stricter prompt,
- reduces batch size,
- falls back across healthy providers,
- optionally performs deterministic extraction from real EvidenceCard text,
- returns structured `SourceUsageFailureReport` when proof remains insufficient.

No validation weakening is needed.

## Source Contract, Citations, Quality Gate, Final Status

`evaluateSourceContract()` distinguishes `passed`, `passed_with_source_gaps`, and `failed`. Fast/deep can pass with gaps only with a SourceGapReport and at least one cited source. PhD/FullSpectrum are strict by default.

`decideFinalResearchStatus()` blocks normal completion when:

- provider error exists,
- zero citations exist,
- source contract failed,
- PhD/FullSpectrum used legacy fallback,
- repair is still required,
- quality gate failed without an allowed source-gap status,
- strict source usage failures are present,
- fallback-looking answer text appears outside the explicit fallback path.

`canMergeResearchAnswerIntoArchive()` currently blocks failed, partial, fallback, quality-failed, raw-metadata, and incomplete fallback answers.

## Frontend Status Sync

`frontend/src/hooks/use-pipeline-state.ts` already preserves `failed`, `provider_error`, `cancelled`, `completed_with_source_gaps`, and `legacy_fallback_used` against a later `COMPLETE` action. `SourcePanel` uses backend `citationStatus.citedSourceIds` when provided, with regex fallback only when structured status is absent.

## Verification Evidence Before Implementation

Commands run before code edits:

- `npm.cmd run typecheck --prefix backend`: passed.
- `npm.cmd run typecheck --prefix frontend`: passed.
- `npm.cmd test --prefix backend ...`: ran the backend test glob plus requested focused files; 258 passed, 5 skipped, 1 failed.
- `npm.cmd run smoke:source-usage --prefix backend`: passed using local smoke provider; no live keys configured.
- `npm.cmd run smoke:visible-research-output --prefix backend`: passed; metadata stripped, terminal status `completed_with_source_gaps`, archive merge false.
- `npm.cmd run smoke:research-modes --prefix backend`: failed honestly because no model keys and no search keys are configured.

## Confirmed Gaps

1. `docs/backend-overhaul/phase-2-core-research-pipeline-diagnosis.md` was missing before this pass.
2. `docs/backend-overhaul/phase-2-core-research-pipeline-repair-report.md` was missing before this pass.
3. Full backend tests are blocked by a security regression: invalid NVIDIA key text appears inside aggregate provider status error output.
4. `backend/package.json` does not expose `smoke:core-research`.
5. `backend/scripts/smoke-test-core-research.ts` is missing.
6. Backend/frontend `citationStatus` metadata currently lacks explicit `invalidCitations` and `citedBuckets` fields requested by the Phase 2 interface.

## Remaining Runtime Limitation

Live end-to-end Prompt A/B runs cannot be completed in this environment without configured model and search provider keys. The current smoke suite must report that as `provider_config_error` / missing keys, not as success.
