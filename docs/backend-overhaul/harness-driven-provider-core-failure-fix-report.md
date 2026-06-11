# Summary

Fixed the harness-reproduced provider/model and fast core-generation failure path without weakening SourceUsageMap, citation validation, or provider health semantics.

The fix makes catalog fallback display-only, keeps unknown provider status out of research selection, stops model-list fallback states from becoming HTTP 502 spam, budgets fast Groq prompts before final generation, retries 413 with compression, falls back after 429, and sanitizes provider errors.

# Root Causes

- Model-list endpoints returned 400/401/429/502/503 for expected structured provider states, so fallback/catalog/model-list failures looked like terminal server failures.
- `frontend/src/hooks/use-provider-models.tsx` converted any non-empty model response into `healthy: true`.
- `getHealthyProvidersForResearch()` treated missing provider status as healthy.
- `buildCoreAnswerUserPrompt()` duplicated full `EvidenceRegistry` and full `EvidencePacks`, allowing fast Groq final generation to exceed the 12k TPM tier with a roughly 32k-token request.
- `buildFinalAnswer()` had no compressed retry for 413 and no healthy-provider fallback for 429.
- Source-usage provider failures had no per-run cooldown state.
- Latency budget warnings did not affect later prompt compression/optional-stage behavior.
- Provider errors kept too much raw provider text or lost useful sanitized context.

# Files Changed

- `frontend/src/hooks/use-provider-models.tsx`
- `frontend/src/hooks/use-provider-models-core.ts`
- `frontend/src/hooks/use-provider-models.test.ts`
- `backend/src/routes/providers.ts`
- `backend/src/core/providers/provider-health.ts`
- `backend/src/core/providers/provider-errors.ts`
- `backend/src/core/providers/provider-run-state.ts`
- `backend/src/core/security/secret-redaction.ts`
- `backend/src/core/latency/latency-budget.ts`
- `backend/src/core/synthesis/model-role-runner.ts`
- `backend/src/core/generation/prompt-budget.ts`
- `backend/src/core/generation/core-answer-prompt.ts`
- `backend/src/core/generation/core-answer-generator.ts`
- `backend/src/core/pipeline/research-pipeline.ts`
- `backend/package.json`
- `backend/scripts/smoke-test-provider-route-semantics.ts`
- `backend/scripts/smoke-test-core-generation-budget.ts`
- `backend/scripts/smoke-test-provider-fallback.ts`
- `backend/scripts/smoke-test-fast-research-local.ts`
- New harness/tests under `backend/tests/harness`, `backend/tests/providers`, `backend/tests/generation`, and `backend/tests/latency`
- `docs/backend-overhaul/harness-provider-core-failure-diagnosis.md`

# Harnesses Added

- `backend/tests/harness/fake-provider-router.ts`
- `backend/tests/harness/fake-evidence-registry.ts`

# Tests Added

- Provider route HTTP semantics and secret safety.
- Provider-health unknown-status behavior.
- Prompt budget compression for 25-source/11-pack fast Groq runs.
- 413 compressed retry and 429 provider fallback.
- Provider error sanitization.
- Per-run cooldown for 429/413.
- Latency budget enforcement.
- Frontend display-only catalog and research-usable model filtering.

# Runtime Reasoning

Catalog fallback is now visible for dropdown display but not research-usable unless `healthy === true` or `canChat === true`. This prevents fallback catalog models from being auto-selected for research.

Model-list UI endpoints now return stable structured payloads for expected provider states. The UI must use payload status fields rather than treating HTTP 502 as provider truth.

Fast Groq final generation uses `PromptBudget` before sending the prompt. The compact prompt includes selected sources and compact evidence packs only, with a `PromptBudgetReport` attached to core results/events. If Groq still rejects the request as too large, the same provider is retried once with stricter compression. Rate-limited providers are cooled down and the generator tries the next registered healthy provider.

SourceUsageMap remains strict. Deterministic extraction still uses actual EvidenceCard text only; the validator was not weakened.

# Commands Run

- `node --import tsx --test backend targeted harness tests`
- `node --import tsx --test ..\frontend\src\hooks\use-provider-models.test.ts`
- `npm.cmd run typecheck --prefix backend`
- `npm.cmd run typecheck --prefix frontend`
- `npm.cmd test --prefix backend`
- `npm.cmd run build --prefix backend`
- `npm.cmd run build --prefix frontend`
- `npm.cmd run build`

# Smoke Results

- `npm.cmd run smoke:provider-route-semantics --prefix backend`: passed
- `npm.cmd run smoke:core-generation-budget --prefix backend`: passed; fast Groq prompt estimated 939 tokens under 8000-token budget
- `npm.cmd run smoke:provider-fallback --prefix backend`: passed; showed Groq -> compressed Groq -> NVIDIA fallback path
- `npm.cmd run smoke:fast-research-local --prefix backend`: passed; over-budget fast path forced compression level 3 and cooled down Groq

# Verification

- Backend full suite: 291 tests total, 286 passed, 5 skipped, 0 failed.
- Backend typecheck: passed.
- Frontend typecheck: passed.
- Backend build: passed.
- Frontend build: passed with the existing Vite large chunk warning.
- Root build: passed.
- Local built UI smoke via `node C:\tmp\bestdel-verify-ui.cjs`: passed and wrote `docs/backend-overhaul/chat-interface-visual-hierarchy.png`.

# Manual Verification

Manual Groq-key acceptance was not completed because no real Groq key was provided in this run. The non-key local browser/static smoke passed. The key-dependent path should be rerun with a valid Groq key to confirm live model-list payloads, 429 behavior, and real final-generation fallback under the provider tier.

# Remaining Limitations

- Live Groq/GitHub/NVIDIA fallback behavior was validated with harnesses and smokes, not with real provider keys.
- `/api/:provider/models` now intentionally returns HTTP 200 for expected provider states; callers must read `status`, `healthy`, `canChat`, and `canListModels` from the JSON payload.
- The source-usage cooldown is per role invocation/run state; it does not persist across independent HTTP requests.
- Frontend displays prompt/failure reports through structured events when present, but richer visual treatment for `PromptBudgetReport`/`RateLimitReport` can still be improved.
