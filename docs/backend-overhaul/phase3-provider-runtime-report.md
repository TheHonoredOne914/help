# Phase 3A Provider Runtime Modularization Report

## Scope

Provider runtime only. No changes were made to `backend/src/core/search/*`, `backend/src/core/retrieval/*`, `backend/src/core/pipeline/research-pipeline.ts`, `backend/src/core/generation/core-answer-generator.ts`, or `backend/src/services/anthropic-service.ts`.

## Files Changed

- `backend/src/lib/provider-router.ts`
- `backend/src/routes/providers.ts`
- `backend/src/core/providers/provider-key-extraction.ts`
- `backend/src/core/providers/provider-status-contract.ts`
- `backend/src/core/providers/provider-model-route-contract.ts`
- `backend/src/core/providers/provider-model-id.ts`
- `backend/src/core/providers/provider-health-policy.ts`
- `backend/src/core/providers/provider-errors.ts`
- `backend/src/core/providers/provider-run-state.ts`
- `backend/tests/providers/provider-key-extraction.test.ts`
- `backend/tests/providers/provider-model-id.test.ts`
- `backend/tests/providers/provider-health-policy.test.ts`
- `backend/tests/providers/provider-run-state.test.ts`
- `backend/tests/providers/provider-error-sanitization.test.ts`

## Modules Extracted

- `provider-key-extraction.ts`: central request/env key extraction for chat providers and existing search/extraction keys, including `exaKey` and `firecrawlKey`.
- `provider-model-id.ts`: provider prefix parsing and native model ID preservation. It strips only the first provider prefix.
- `provider-status-contract.ts`: shared status contract and status enum.
- `provider-model-route-contract.ts`: HTTP/model-route response normalization for `healthy`, `canChat`, `canListModels`, and model counts.
- `provider-health-policy.ts`: central health/capability policy so catalog fallback cannot become health.

## Implementation Notes

### Problem

Provider runtime policy was split implicitly between `provider-router.ts` and `routes/providers.ts`. Key extraction, model ID parsing, status normalization, and route capability semantics were coupled to route code.

### Root Cause

The provider runtime grew incrementally: model-list routes, status probes, and core routing each encoded related rules locally. That made it easy for catalog fallback, native nested model IDs, or provider errors to drift between routes and core provider resolution.

### Fix

Provider runtime helpers were extracted into focused modules and the existing route/router code now delegates to them:

- `extractKeys()` delegates to `extractProviderKeys()`.
- `parseProviderModelId()` and `SUPPORTED_PROVIDER_PREFIXES` are re-exported from `provider-model-id.ts`.
- Provider status/model-route payloads use `deriveProviderHealthPolicy()`.
- UI-safe provider errors redact raw JSON provider bodies.
- Run state exposes `getSafeMetadata()` with only provider name, counters, cooldown timing, and classified error code.

### Runtime Reasoning

The user-facing provider path remains the same externally:

- Requests still enter model routes in `backend/src/routes/providers.ts`.
- Core provider routing still resolves through `backend/src/lib/provider-router.ts`.
- Existing API shapes are preserved.

The internal policy is now centralized:

- `catalog_fallback` is display-only and normalizes to `healthy: false`.
- `canChat` and `canListModels` remain separate.
- Missing/invalid/rate-limited/network/unknown statuses do not imply health.
- Nested model IDs such as `nvidia/moonshotai/kimi-k2.6`, `github/openai/gpt-4.1`, and `openrouter/anthropic/claude-sonnet-4.5` preserve everything after the first slash.
- 429 cooldown and 413 request-too-large counters remain run-scoped and safe to expose.

## Provider Status Behavior

Before:

- Status and capability normalization lived in `routes/providers.ts`.
- Catalog fallback handling was correct in places, but policy was route-local.
- Key extraction lived in the general provider router.

After:

- `healthy` is true only for `status: "healthy"` with a configured provider and positive health signal.
- `catalog_fallback`, `missing_key`, `invalid_key`, `rate_limited`, `network_error`, `timeout`, `status_unknown`, `unverified`, and `unavailable` do not become healthy.
- Catalog models can still be listed for display via `canListModels`.
- `canChat` remains independently expressible for explicitly unverified-but-chat-capable paths.

## Model ID Routing Behavior

Verified behavior:

- `nvidia/moonshotai/kimi-k2.6` -> provider `nvidia`, model `moonshotai/kimi-k2.6`
- `github/openai/gpt-4.1` -> provider `github`, model `openai/gpt-4.1`
- `openrouter/anthropic/claude-sonnet-4.5` -> provider `openrouter`, model `anthropic/claude-sonnet-4.5`

Only the first slash is treated as the BestDel provider prefix separator.

## Tests Added

- `backend/tests/providers/provider-key-extraction.test.ts`
- `backend/tests/providers/provider-model-id.test.ts`
- `backend/tests/providers/provider-health-policy.test.ts`
- `backend/tests/providers/provider-run-state.test.ts`

Updated:

- `backend/tests/providers/provider-error-sanitization.test.ts`

## Verification

Commands run from `C:\tmp\bestdel-provider-runtime-modularization`.

- `node --import tsx --test tests/providers/provider-key-extraction.test.ts tests/providers/provider-model-id.test.ts tests/providers/provider-health-policy.test.ts tests/providers/provider-run-state.test.ts tests/providers/provider-error-sanitization.test.ts` -> exit code 0, 13 passed.
- `node --import tsx --test tests/providers/*.test.ts tests/provider-health.test.ts` -> exit code 0, 71 passed.
- `npm.cmd run typecheck --prefix backend` -> exit code 0.
- `npm.cmd test --prefix backend` -> exit code 0 on final run, 338 tests, 333 passed, 5 skipped.
- `npm.cmd run build --prefix backend` -> exit code 0.
- `npm.cmd run typecheck --prefix frontend` -> exit code 0.
- `npm.cmd test --prefix frontend` -> exit code 0, 5 passed.
- `npm.cmd run build --prefix frontend` -> exit code 0.
- `npm.cmd run build` -> exit code 0.

Note: the first full backend test run reported one failure in `tests/retrieval/bucketed-retrieval-live-path.test.ts`, outside this task scope. The same file passed alone immediately afterward, and the final full backend test run passed with 0 failures.

## Remaining Risks

- Provider runtime changes are locally verified with deterministic tests; live provider behavior still depends on real API keys and provider availability.
- The full backend suite showed one transient retrieval-path failure before passing on rerun. No retrieval or search code was changed for this task.
- Frontend bundle size warning remains from the existing Vite build and is unrelated to this provider runtime change.
