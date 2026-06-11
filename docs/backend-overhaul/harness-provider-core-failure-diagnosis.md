# Harness Provider/Core Failure Diagnosis

Date: 2026-05-22

## 1. Provider model-list path

- File: `backend/src/routes/providers.ts`
- Functions: `/api/:provider/models` route handlers, `httpStatusForProviderStatus()`, `sendProviderModelPayload()`, `providerRouteErrorPayload()`
- Exact bug: expected structured states such as `missing_key`, `catalog_fallback`, `network_error`, `unverified`, and `rate_limited` are converted into HTTP 400/401/429/502/503 by `httpStatusForProviderStatus()`.
- Why it causes terminal behavior: model list probes for NVIDIA, OpenRouter, Ollama, Gemini, Groq, and GitHub can return truthful provider-status payloads, but the HTTP status makes the frontend/dev proxy log them as request failures and can trigger retry/spam behavior. A catalog fallback becomes a server-looking 502 even though the payload is structured and expected.
- Harness test: `backend/tests/providers/model-list-http-semantics.test.ts` proves expected provider states return stable UI payload semantics and that only unhandled server failures should be treated as HTTP 500.

## 2. Provider status path

- File: `backend/src/routes/providers.ts`
- Functions: `buildProviderStatusPayload()`, `probeProviderModels()`
- Exact bug: provider status mostly carries structured fields, but model route semantics disagree with status semantics. Catalog-backed model visibility can be valid for display while `healthy` is false and `canChat` is false.
- Why it causes terminal behavior: `/api/providers/status` returns 200 with provider fields, while `/api/:provider/models` returns non-2xx for the same expected states. The frontend receives contradictory health signals and can treat model refresh as a hard server failure.
- Harness test: provider route tests assert that structured statuses keep `healthy: false`, include `canChat`/`canListModels`, and do not leak secrets in `error`.

## 3. Settings/localStorage/header path

- File: `frontend/src/hooks/use-provider-models.tsx`
- Functions: `refreshProviderStatus()`, `refreshProviderModels()`, `statusFromSuccessfulModelRoute()`, `healthyResearchModels`
- Exact bug: `statusFromSuccessfulModelRoute()` turns any non-empty returned model list into `healthy: true` and `status: "healthy"`. `healthyResearchModels` also includes configured catalog/unverified/network-error models as usable research models.
- Why it causes terminal behavior: catalog fallback models displayed by the backend are promoted into research-ready models, so the selected provider/model can enter research even when the provider is not verified for chat or JSON tasks.
- Harness test: `frontend/src/hooks/use-provider-models.test.ts` proves catalog and network-error models remain display-only, live healthy models are selectable, and stale selections repair only to research-usable models.

## 4. Fast research retrieval path

- File: `backend/src/core/pipeline/research-pipeline.ts`
- Functions: `runResearchPipeline()`, `retrieveLiveSourcesIfNeeded()`
- Exact bug: retrieval and enrichment latency warnings are emitted but do not feed into later stage choices.
- Why it causes terminal behavior: even after retrieval exceeds the fast budget, the pipeline proceeds into model source usage and final generation as if the run still has full budget, making a fast run eligible to build an oversized final prompt.
- Harness test: `backend/tests/latency/latency-budget-enforcement.test.ts` proves over-budget fast stages force stronger prompt compression and optional-stage skipping.

## 5. Source usage provider fallback path

- File: `backend/src/core/synthesis/model-role-runner.ts`
- Functions: `runModelRoleForSourceUsage()`, `getHealthyGenerationProviders()`, `runSourceUsageBatch()`
- Exact bug: provider failures are tracked only as a local broken-provider set. There is no per-run cooldown record for 429, no retry-after parsing, and provider errors are pushed with raw messages.
- Why it causes terminal behavior: Groq 429 and GitHub 429 can both be attempted during the same fast run before deterministic extraction recovers. This wastes time/tokens and can expose verbose provider bodies.
- Harness test: `backend/tests/providers/provider-run-cooldown.test.ts` and `backend/tests/integration/source-usage-rate-limit-recovery.test.ts` prove 429 cools down a provider, fast mode skips cooled providers, and deterministic extraction remains strict.

## 6. Core generation prompt-building path

- Files: `backend/src/core/generation/core-answer-prompt.ts`, `backend/src/core/generation/core-answer-generator.ts`, `backend/src/core/evidence/evidence-registry.ts`, `backend/src/core/evidence/evidence-pack-builder.ts`
- Functions: `buildCoreAnswerUserPrompt()`, `buildFinalAnswer()`
- Exact bug: the final answer prompt includes `EvidenceRegistry.exportForPrompt()` and full EvidencePacks with up to 20 cards per pack. It has no provider/model/mode budget, no source/card/fact trimming, and no PromptBudgetReport.
- Why it causes terminal behavior: a fast run with 25 citation-eligible sources and 11 packs can build a roughly 32k-token prompt and send it to Groq `llama-3.3-70b-versatile`, which exceeds the 12k TPM limit and fails with 413.
- Harness test: `backend/tests/generation/core-answer-prompt-budget.test.ts` proves a 25-source/11-pack fast Groq prompt stays under budget and reports compression.

## 7. Final status/SSE failure path

- Files: `backend/src/core/generation/core-answer-generator.ts`, `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/services/anthropic-service.ts`, `frontend/src/hooks/use-pipeline-state.ts`
- Functions: `buildFinalAnswer()`, `runResearchPipeline()`, SSE error handling, `pipelineReducer()`
- Exact bug: core generation provider errors are thrown without compressed retry/fallback, so the pipeline emits `pipeline_failed`. Since SSE already started, HTTP remains 200 and the terminal status must be represented in stream events/UI state rather than HTTP status.
- Why it causes terminal behavior: logs show `pipeline_failed` and `Error processing message` while the HTTP response remains 200. If the frontend treats completion events as green success after a provider error, the UI can misrepresent a failed run.
- Harness test: core generation fallback tests prove 413 retries with a smaller prompt, 429 cools down and falls back, all-provider failure returns a safe provider error report, and frontend pipeline state keeps `provider_error` out of green complete.
