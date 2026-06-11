# FullSpectrum Merged ZIP Diagnosis

Date: 2026-05-22
Workspace: `C:\Users\HP\Downloads\BestDel\bestdel_fixed`

This diagnosis verifies the implementation prompt against the current source tree before code changes. The pass uses the active source tree that produced the latest source ZIP.

## Confirmed Issues

### 1. Provider/model route semantics

- file: `backend/src/routes/providers.ts`
- functions: `providerRouteErrorPayload`, `statusCacheKey`, `buildProviderStatusPayload`, `probeProviderModels`, `/gemini/models`
- current behavior: `providerRouteErrorPayload()` always sets `source: "catalog_fallback"` even when no fallback models are returned. Gemini successful live checks return `source: "catalog_fallback"`. `statusCacheKey()` hashes raw key strings with an in-process djb2-style hash. Status probing sets `canChat` only from `healthy`, and the provider status route can still conflate catalog model availability with listing availability.
- why it is wrong: missing/invalid/rate-limited providers with no models should not advertise catalog fallback; Gemini live verification should say live; cache keys should never be derived from raw secrets with a reversible/weak custom hash.
- implementation fix: use SHA-256 fingerprints per provider key, set route error source to `live` when no fallback models are returned, set Gemini live source to `live`, and keep `canChat` separate from catalog listing.
- test needed: provider route error source semantics, Gemini source live, cache fingerprint no raw secret.

### 2. Frontend provider state and stale selections

- file: `frontend/src/hooks/use-provider-models.tsx`
- functions: `normalizeStatus`, `buildHealthyResearchModels`, hydration effect in `ProviderRuntimeProvider`
- current behavior: `buildHealthyResearchModels()` already checks `healthy === true || canChat === true`, so catalog-only/unverified providers are generally excluded from research models. Model display can still include fallback catalogs. The normal selected model repair only removes stale models when `healthyResearchModels` changes.
- why it is wrong: the core research set is mostly correct, but test coverage needs to lock the contract. Stale selections should be repaired only to research-usable models and never to catalog-only display models.
- implementation fix: keep healthy/canChat-only research filtering and add contract tests; make status normalization preserve explicit raw booleans only.
- test needed: `buildHealthyResearchModels()` excludes `catalog_fallback`, `unverified`, `network_error`, and `unavailable` unless `canChat === true`.

### 3. Fast Research model routing

- file: `frontend/src/components/chat/chat-area.tsx`
- function: `runStream`, active model display, model dropdown labels, silence timer model set
- current behavior: `fast_research` and all non-normal modes use `deepResearchModels` for `activeProviderModel`, request `webModels`, status label, dropdown count, and stream silence timer.
- why it is wrong: Fast/Web research has its own `webSearchModels` state and should not be routed through deep research selections.
- implementation fix: add `getModelsForMode()` and `getPrimaryModelForMode()` helpers and use them for request payload, active model display, and timeout logic.
- test needed: fast sends `webSearchModels`, deep/PhD/Full send `deepResearchModels`, normal sends only `normalModel`.

### 4. SourceUsageMap aggregation

- file: `backend/src/core/pipeline/research-pipeline.ts`
- function: `aggregateSourceUsageResults`
- current behavior: aggregation uses `Math.max(...outputs.map(output.sourceUsageCount))`.
- why it is wrong: role counts are not authoritative and do not union distinct validation-valid source IDs across roles.
- implementation fix: validate every role output with `validateSourceUsageMap()` and union `report.usedSourceIds`; do not count invalid semantic items or `relevant_but_weak`.
- test needed: role A `[1,2,3]` plus role B `[4,5,6]` aggregates to 6; overlap counts once; invalid usage does not count.

### 5. Deep democratic-space source target

- files: `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/core/generation/core-answer-generator.ts`
- functions: `getEffectiveSourceUsageTarget`, `generateCoreResearchAnswer`
- current behavior: deep research with `topicType === "indian_democratic_space"` silently upgrades target to 30 in both pipeline source target and final answer target.
- why it is wrong: broader retrieval is valid, but deep mode final contract must remain 20; 30-source strictness belongs to PhD and FullSpectrum.
- implementation fix: remove the deep/democratic-space override and use mode policy targets.
- test needed: deep democratic-space target is 20; PhD/Full remain 30.

### 6. Per-role source usage target

- file: `backend/src/core/pipeline/research-pipeline.ts`
- function: `runSourceUsageRoles`
- current behavior: every source usage role receives `minimumSourceRequirement: Math.min(requiredSources, citationEligibleCount)`.
- why it is wrong: each role is forced to satisfy the full aggregate mode target, which is too heavy for fast/deep and causes avoidable failures.
- implementation fix: add a mode-aware per-role target helper while keeping aggregate/final policy strictness.
- test needed: fast per-role target caps at 8, deep at 12, PhD at 20, FullSpectrum at 25.

### 7. Synthetic SourceUsageMap fallback

- file: `backend/src/core/generation/core-answer-generator.ts`
- function: `generateCoreResearchAnswer`
- current behavior: if `sourceUsageMaps` is empty, the generator synthesizes SourceUsageMap outputs from the registry.
- why it is wrong: live model generation must not fabricate source usage proof silently.
- implementation fix: add `allowSyntheticSourceUsage?: boolean`; allow synthetic maps only for explicit deterministic/test paths, otherwise throw `SOURCE_USAGE_MISSING`.
- test needed: live model generation without SourceUsageMap fails.

### 8. Core prompt budgeting and provider fallback

- file: `backend/src/core/generation/core-answer-generator.ts`
- functions: `buildFinalAnswer`, `tryGeneration`, `buildGenerationCandidates`
- current behavior: model generation uses budgeted prompts, but candidate selection can use any registered provider and does not consult provider run cooldown. 413 retries with compression; 429 does not record shared run-wide cooldown here.
- why it is wrong: registered does not mean healthy, and a rate-limited provider should be skipped for the rest of the run.
- implementation fix: pass shared `ProviderRunState`, record 413/429 failures, skip cooled providers, and include cooldown metadata in provider failure reports.
- test needed: 429 records cooldown and fallback; 413 retries compressed and then falls back.

### 9. D1-D11 division synthesis

- file: `backend/src/core/generation/core-answer-generator.ts`
- function: `buildDivisionOutputs`
- current behavior: D1-D11 outputs are short template strings with citations appended.
- why it is wrong: template strings are not synthesis and D7/D11 do not meet product requirements.
- implementation fix: replace production division output builder with evidence-driven division synthesis; deterministic fallback must be marked and D7/D11 must have required structure.
- test needed: D7 includes Treasury/Opposition/POIs/rebuttals/clauses; D11 includes Diagnosis/Prescription/Warning.

### 10. Agenda-dynamic section planning

- files: `backend/src/core/generation/core-answer-generator.ts`, `backend/src/core/generation/core-answer-prompt.ts`
- functions: `SECTION_PLAN`, `buildCoreAnswerOutputContract`, `buildAnswerText`
- current behavior: section plan is hardcoded around democratic-space themes.
- why it is wrong: economic/security/legal agendas should not receive democracy-index sections unless relevant.
- implementation fix: add `section-plan-builder.ts` and use it in prompt contract and deterministic answer generation.
- test needed: security/economic/democratic-space section plans differ.

### 11. Retrieval top-up and multi-hop expansion

- file: `backend/src/core/retrieval/bucketed-retrieval.ts`
- function: `runBucketedRetrieval`
- current behavior: top-up query is a generic string like `India {bucketId} source evidence {years}`; no multi-hop expander is wired.
- why it is wrong: generic top-ups produce low-quality and context-blind retrieval.
- implementation fix: build contextual bucket top-up queries from agenda keywords and existing source entities; add multi-hop expansion for PhD/FullSpectrum.
- test needed: top-up query never contains `{bucketId} source evidence`-style garbage and references agenda terms.

### 12. Source enrichment concurrency

- file: `backend/src/core/retrieval/source-enrichment.ts`
- function: `enrichSources`
- current behavior: enrichment uses `Promise.all(sources.map(...))`.
- why it is wrong: uncontrolled concurrency can rate-limit Jina and create noisy failures.
- implementation fix: add bounded concurrency with mode-specific defaults and backoff/fallback behavior.
- test needed: no more than configured concurrent enrichment calls.

### 13. Source classification

- files: `backend/src/core/retrieval/source-scoring.ts`, `backend/src/core/evidence/evidence-registry.ts`
- functions: `classifySource`, evidence source classification helper
- current behavior: social media is recognized, but several Indian parliamentary/legal/government/media/academic domains requested in the prompt are missing or under-classified.
- why it is wrong: source buckets and citation eligibility depend on accurate source classes.
- implementation fix: expand domain classification maps and keep social media non-citation-eligible by default.
- test needed: sansad/loksabha/rajyasabha parliamentary, ncrb/data.gov official, mpa/egazette official, social media not citation eligible.

### 14. Source-gap-report duplication

- files: `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/core/generation/core-answer-generator.ts`
- functions: `buildSourceGapReport`, `buildSourceGapReportIfNeeded`
- current behavior: two local implementations exist.
- why it is wrong: provider errors/enrichment failures and explanations can diverge across pipeline and generator.
- implementation fix: move one implementation to `backend/src/core/evidence/source-gap-report.ts` and use it from both modules.
- test needed: single helper includes providerErrors and enrichmentFailures.

### 15. Hallucination guard and legal claim validation

- files: `backend/src/core/verification/hallucination-guard.ts`, `backend/src/core/verification/legal-claim-validator.ts`
- functions: `runHallucinationGuard`, `validateLegalClaims`
- current behavior: hallucination guard only catches fake Source IDs and Article mentions without any source base; legal validator only checks whether legal language exists without legal-class sources.
- why it is wrong: fake URL mappings, fake Articles, ungrounded cases, unsupported stats, UN framing, and electoral overclaims can pass.
- implementation fix: validate linked citation IDs/domains, Article list, case names against registry, numbers against source text, UN framing, and absolute electoral overclaims.
- test needed: Source 99, URL mismatch, fake Article 99, unsupported ranking, UN framing, electoral fraud overclaim.

### 16. Quality gate and repair specificity

- files: `backend/src/core/verification/thesis-quality-gate.ts`, `backend/src/core/verification/repair-orchestrator.ts`, `backend/src/core/generation/core-answer-generator.ts`
- functions: `runThesisQualityGate`, `runTargetedRepair`, repair pass block in `generateCoreResearchAnswer`
- current behavior: quality gate has shallow checks; repair is mostly deterministic string handling for limited cases; quality-gate failures are not converted into targeted repair types before rerunning validation.
- why it is wrong: D7/D11 depth and dynamic sections are not enforced, and fatal quality issues can be under-specified.
- implementation fix: add D7/D11/dynamic section checks and issue-specific prompt templates; rerun citation, hallucination, and quality validation after repair.
- test needed: D7 missing amendment language fails; D11 missing structure fails; repair prompt differs by issue.

### 17. Citation status metadata

- files: `backend/src/core/verification/citation-validator.ts`, `backend/src/core/pipeline/pipeline-metadata.ts`, `frontend/src/lib/pipeline-metadata.ts`, `frontend/src/hooks/use-pipeline-state.ts`
- current behavior: citation validator already exposes invalid/rejected/cited bucket metadata, but frontend contract needs verification against the current metadata shape.
- why it is wrong: citation UI must trust structured backend metadata, not regex-only source chips.
- implementation fix: preserve existing structured fields and add tests for metadata propagation.
- test needed: fake IDs fail; citedBuckets and missingSourceBuckets populate.

### 18. Frontend terminal status semantics

- files: `frontend/src/hooks/use-pipeline-state.ts`, `frontend/src/components/chat/research-pipeline.tsx`
- functions: pipeline reducer terminal handling, phase derivation
- current behavior: reducer uses `isComplete` for terminal states including `completed_with_source_gaps` and `legacy_fallback_used`; UI phase can become `complete` from `isComplete`.
- why it is wrong: terminal is not success; source-gap, provider-error, legacy fallback, failed, and cancelled need warning/error/info severity.
- implementation fix: derive terminal status metadata with `isTerminal`, `isSuccessful`, and severity; do not use `isComplete` as green success.
- test needed: source gap/provider error/legacy fallback/failed are not green.

### 19. Prompt budget report UI

- files: `backend/src/services/anthropic-service.ts`, `frontend/src/hooks/use-pipeline-state.ts`, `frontend/src/components/chat/research-pipeline.tsx`
- current behavior: backend emits `promptBudgetReports` on `final_answer_ready`; frontend needs a compact advanced rendering check.
- why it is wrong: prompt-budget behavior must be visible in pipeline/debug UI, not hidden in final answer.
- implementation fix: preserve metadata/events and render compact prompt budget rows in pipeline details.
- test needed: report shows provider/model/tokens/compression/source counts.

### 20. Archive merge safety

- files: `backend/src/core/archive/archive-merge-safety.ts`, `backend/src/core/pipeline/final-status.ts`
- current behavior: existing memory and source indicate archive safety rejects failed/fallback/source-gap/metadata-bearing answers, but current implementation still needs regression coverage after final status changes.
- why it is wrong: partial/fallback/failed answers must never merge into archive context.
- implementation fix: keep strict merge predicate and add/refresh regression tests after status changes.
- test needed: partial/fallback/failed answers are not mergeable.

## Claims Already Fixed Or Partially Fixed

- `healthyResearchModels` does not currently include catalog-only/unverified providers unless the status says `healthy` or `canChat`.
- Prompt construction for model generation already uses `buildCoreAnswerUserPrompt(input, budget)` instead of the unbudgeted overload.
- Citation validator already has fields for `rejectedCitations`, `invalidCitations`, `citedBuckets`, `missingSourceBuckets`, and `citationCoverage`; propagation and frontend usage still need confirmation tests.
- Archive safety already has a strict dedicated module; it should be preserved and covered by new regressions rather than rewritten.

## Brooks-Lint Architectural Risks

- Conceptual integrity risk: source-gap reporting, source usage aggregation, final status, and archive safety are split across modules but some duplicate local helpers still exist.
- Release It risk: provider run state exists but is not shared run-wide through all source-usage and final-generation calls, weakening cooldown/bulkhead behavior.
- Domain clarity risk: the current final answer section plan is democracy-space-specific while the product domain covers many Indian committee types.
- Legacy-code risk: production generation still has deterministic/template fallback paths that look like successful synthesis unless downstream status and quality gates mark them explicitly.
