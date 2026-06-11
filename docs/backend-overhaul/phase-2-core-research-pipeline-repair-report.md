# Phase 2 Core Research Pipeline Repair Report

Date: 2026-05-21

## Summary

Phase 2 was implemented as a gap-closing pass over the existing core research pipeline. The repo already had strict SourceUsageMap validation, source-usage retry/fallback, source policy, source contract, final status, metadata stripping, archive merge safety, and frontend warning-state handling. This pass fixed the confirmed test-blocking provider-status secret leak, added the missing core-research smoke command, expanded citation metadata, and created the required diagnosis/report docs.

## Diagnosis

- SourceUsageMap validation was already strict and correctly rejects listing-only, title-only, fake-ID, repeated-generic-claim, weak-only, and unsupported legal-holding usage.
- Non-strict modes already use mode policy and source-gap handling; Fast/Web targets 10 sources, Deep targets 20, and Deep democratic-space prompts can still target 30 through agenda-specific policy.
- Strict modes already fail through `SOURCE_USAGE_VALIDATION_FAILED` / final-status policy when PhD/FullSpectrum proof cannot be validated.
- Legacy fallback is already explicit and cannot become normal completion through `decideFinalResearchStatus()`.
- Source contract already distinguishes `passed`, `passed_with_source_gaps`, and `failed`.
- Quality gate and repair state already feed final status; repair-required and failed quality gates cannot be normal completion.
- Citation validation already rejects fake citations and bare citation spam. Missing interface fields were `invalidCitations` and `citedBuckets`.
- Query planner already removes duplicated years and rejects generic junk through regression tests.
- Source classification already separates social media from official/government evidence.
- Archive merge safety already rejects failed, fallback, partial, raw-metadata, and quality-failed outputs.
- Confirmed bug: aggregate NVIDIA provider status could leak a request-provided invalid key in `providers.nvidia.error`.

## Files Changed

Source/citation metadata:

- `backend/src/core/verification/citation-validator.ts`: added `invalidCitations` and `citedBuckets` to the citation validation report.
- `backend/src/core/pipeline/pipeline-metadata.ts`: added citation metadata fields plus `sourceUsageFailureReports` and `providerErrors`.
- `frontend/src/lib/pipeline-metadata.ts` and `frontend/src/hooks/use-pipeline-state.ts`: added frontend metadata/type support for the new citation fields.
- `backend/src/services/anthropic-service.ts`: persists/emits citationStatus with invalid citations and cited buckets, and includes source-usage/provider error metadata.

Provider safety:

- `backend/src/routes/providers.ts`: redacts request-provided NVIDIA keys in both model-list and aggregate provider-status error paths.

Smoke/testing:

- `backend/package.json`: added `smoke:core-research`.
- `backend/scripts/smoke-test-core-research.ts`: added deterministic local core-pipeline smoke that prints mode, provider/model, query count, source counts, SourceUsageMap valid count, sourceContract, citationStatus, qualityGate, terminalStatus, legacyFallbackUsed, and archive merge eligibility without keys.
- `backend/tests/regression/phase-2-metadata-and-smoke.test.ts`: added regression coverage for the smoke command and citationStatus metadata contract.

Docs:

- `docs/backend-overhaul/phase-2-core-research-pipeline-diagnosis.md`: added pre-code diagnosis.
- `docs/backend-overhaul/phase-2-core-research-pipeline-repair-report.md`: this report.

## Before / After

Before:

- `phase-2-core-research-pipeline-diagnosis.md` and this repair report were missing.
- Full backend tests failed because NVIDIA provider status exposed `nvapi-secret-invalid`.
- `smoke:core-research` did not exist.
- `citationStatus` did not expose `invalidCitations` or `citedBuckets`.

After:

- Strict SourceUsageMap behavior remains unchanged.
- Invalid NVIDIA key text is redacted in provider status.
- `smoke:core-research` runs without live keys and reports honest partial/deep status.
- Citation metadata now includes invalid citations and cited buckets.
- Archive merge remains blocked for source-gap/fallback/failed outputs.

## Commands Run

- `npm.cmd run typecheck --prefix backend`: passed.
- `npm.cmd run typecheck --prefix frontend`: passed.
- `node --import tsx --test tests\regression\phase-2-metadata-and-smoke.test.ts tests\providers\provider-status-health-semantics.test.ts`: 6 passed, 0 failed.
- `npm.cmd test --prefix backend`: 261 passed, 5 skipped, 0 failed.
- `npm.cmd run build --prefix backend`: passed.
- `npm.cmd run build --prefix frontend`: passed; Vite reported the existing large chunk warning.
- `npm.cmd run build`: passed; Vite reported the existing large chunk warning.

## Smoke Test Results

- `npm.cmd run smoke:source-usage --prefix backend`: passed with local smoke provider; 30 assigned and 30 valid used sources, no failure report.
- `npm.cmd run smoke:core-research --prefix backend`: passed. Result was `completed_with_source_gaps`, 15/15 citation-eligible sources cited, 60 planned queries, quality gate passed, no legacy fallback, archive merge false.
- `npm.cmd run smoke:visible-research-output --prefix backend`: passed. Metadata stripped, terminal status `completed_with_source_gaps`, archive merge false.
- `npm.cmd run smoke:research-modes --prefix backend`: exited 1 honestly because no model/search keys are configured. It reported missing `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, and missing search keys; modes reported `provider_config_error` / `configure_provider`.

## Manual UI Verification

Manual live UI research runs were not executed because this environment has no configured model/search provider keys. The frontend build passed, and backend/frontend tests cover metadata stripping, stale run isolation, citationStatus-driven source badges, and warning/failure status preservation. Live Prompt A/B verification should be rerun after configuring at least one model provider key and one search provider key.

## Remaining Limitations

- Live research readiness depends on configured model keys and search keys.
- Provider rate limits and weak model JSON can still produce honest source-gap or failed states.
- Paywalled or snippet-only sources can limit EvidenceCard extraction quality.
- FullSpectrum can still be slow because it intentionally uses the strictest source/citation policy.
- `smoke:research-modes` is expected to fail without live keys; this is correct provider honesty, not a green readiness signal.
