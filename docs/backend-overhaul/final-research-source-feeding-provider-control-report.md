# Final Research Source Feeding + Provider Control Fix Report

Date: 2026-05-26

Scope: final pass over provider selection, Groq model stability, source-card feeding, citation repair, deterministic fallback, provider diagnostics, retrieval budgets, source-usage retry bounds, and frontend run isolation.

## Root Cause

Research had three coupled failure modes.

First, provider selection still allowed implicit chains. Model strategy, source-usage roles, and final generation could append default NVIDIA, GitHub, Gemini, OpenRouter, or Groq candidates even when the user had selected one model. That made a Groq-only run bounce through unrelated providers and consume latency/rate budget.

Second, final source feeding was not contractual enough. The evidence registry could contain enough citation-eligible sources, but prompt compression and final-source selection could under-feed source cards. Under-citation then surfaced as a fatal `fewer than N unique cited sources while enough valid sources exist` error before repair or a deterministic cited fallback could recover.

Third, provider status semantics mixed catalog/model-list health with generation readiness. A 206 model-list response could remain displayable, but it must not become chat-verified generation health. Frontend selection repair also had paths that could overwrite an explicit Groq selection.

## User Flow Fixed

The fixed flow is:

1. User saves provider keys.
2. Frontend stores keys, dispatches the provider update event, refreshes model/status routes, and calls provider diagnostics.
3. Groq catalog/model-list data remains visible even when catalog fallback is not chat verified.
4. User-selected model is preserved unless the provider is explicitly missing, invalid, unavailable, or rate-limited.
5. Research request sends the exact selected `normalModel` plus explicit `autoFallback`.
6. Backend validates the model prefix, preserves nested model IDs, and logs resolved provider/model/fallback state.
7. With `autoFallback=false`, source usage and final generation use only the selected provider/model, except deterministic source usage/fallback paths that do not burn provider budget.
8. Final generation receives the selected citation-eligible source cards and repairs under-citation before returning an honest terminal state.

## Provider Default Removal

Files changed:

- `backend/src/core/providers/model-strategy.ts`
- `backend/src/core/synthesis/model-role-runner.ts`
- `backend/src/core/generation/core-answer-generator.ts`
- `backend/src/services/anthropic-service.ts`
- `frontend/src/components/chat/chat-request-builder.ts`

Implementation:

- `autoFallback` is now explicit and defaults false.
- `buildGenerationCandidates()` no longer appends every registered provider unless `autoFallback=true`.
- Source-usage fallback models are only included when `autoFallback=true`.
- OpenRouter automatic fallback now prefers live `:free` catalog models and does not silently select stale paid defaults.
- Provider health filtering rejects explicit bad endpoint statuses before allowing a selected provider through.

Runtime reasoning:

The user-selected provider/model is now the only model-backed execution path when fallback is off. Provider fallback is an explicit runtime choice, not a default side effect.

## Auto-Fallback Behavior

`autoFallback=false`:

- selected provider/model only for generation;
- deterministic source usage first for fast research;
- provider errors surface as typed provider errors;
- no automatic NVIDIA/GitHub/Gemini/OpenRouter/Groq chain.

`autoFallback=true`:

- selected provider is tried first;
- fallback candidates are allowed;
- run-state cooldowns still block invalid keys, invalid models, billing errors, rate limits, request-too-large prompt/model combos, and repeated timeouts.

## Groq Frontend Selection Fix

Files changed:

- `frontend/src/hooks/provider-models/provider-status-normalizer.ts`
- `frontend/src/hooks/provider-models/model-selection-repair.ts`
- `frontend/src/hooks/use-provider-models.tsx`
- `frontend/src/components/chat/chat-area.tsx`
- `frontend/src/components/chat/settings-dialog.tsx`

Implementation:

- Split displayability from generation verification.
- 206 catalog/model-list responses can display models but do not set `chatVerified`.
- Selection repair no longer prefers NVIDIA Kimi.
- Current user selection is preserved when the provider is configured and not explicitly bad.
- Persisted model state is written from explicit selection, not automatic refresh repair.
- `autoFallback` is stored under `bestdel:auto-fallback:v1` and sent with research requests.

## Backend Model Parsing Fix

File changed:

- `backend/src/services/anthropic-service.ts`

Implementation:

- Empty `normalModel` may use the existing default only because the user supplied no model.
- Non-empty unknown prefixes are rejected with `INVALID_MODEL_PREFIX`.
- Nested model IDs are preserved by splitting only at the first slash.
- The resolved provider/model/autoFallback tuple is logged for research execution.

Covered model forms:

- `groq/llama-3.3-70b-versatile`
- `nvidia/moonshotai/kimi-k2.6`
- `openrouter/qwen/qwen3-32b:free`
- `github/openai/gpt-4.1`
- `gemini/gemini-2.5-pro`
- `ollama/local-model`

## Provider Status Diagnostics On Save

Files changed:

- `backend/src/routes/providers.ts`
- `frontend/src/components/chat/settings-dialog.tsx`

Implementation:

- Added/retained diagnostics route behavior for configured and missing providers.
- Settings Save triggers provider key update, model refresh, and backend diagnostics.
- Diagnostics include generation providers and search/extraction providers:
  `groq`, `openrouter`, `gemini`, `nvidia`, `github`, `ollama`, `serper`, `exa`, `tavily`, `firecrawl`, `jina`.

Smoke result:

- `npm.cmd run smoke:providers --prefix backend`: passed, all providers reported missing keys honestly in this environment.
- `npm.cmd run smoke:provider-refresh --prefix backend`: passed, no fake provider success with no live keys.
- `npm.cmd run smoke:provider-route-semantics --prefix backend`: passed, catalog fallback returns 206, `canListModels=true`, `canChat=false`, `chatVerified=false`, and billing credits map to 402.

## Provider Status Code Logging

Files changed:

- `backend/src/core/providers/provider-call-logger.ts`
- `backend/src/routes/providers.ts`
- `backend/src/core/search/search-provider-router.ts`
- `backend/src/core/search/providers/serper-search-provider.ts`
- `backend/src/core/search/providers/exa-search-provider.ts`
- `backend/src/core/search/providers/firecrawl-extractor-provider.ts`
- `backend/src/core/search/providers/jina-extractor-provider.ts`
- `backend/src/core/retrieval/bucketed-retrieval.ts`
- `backend/src/core/retrieval/source-enrichment.ts`
- `backend/src/core/synthesis/model-role-runner.ts`

Implementation:

- Provider/model/status diagnostics log `provider_model_route_status` and `provider_diagnostic`.
- Generation and source-usage attempts log provider, model, status code, latency, and safe error code.
- Search/extraction providers log status code, latency, success, query/result counts, and safe failure code.
- Logs redact provider secrets.

## Rate Limit Handling

Files changed:

- `backend/src/core/providers/provider-errors.ts`
- `backend/src/core/providers/provider-run-state.ts`
- `backend/src/core/providers/provider-health.ts`
- `backend/src/core/providers/provider-health-policy.ts`
- `backend/src/routes/providers.ts`

Implementation:

- `billing_credits` is a first-class provider error.
- HTTP mappings:
  - 401/403: `invalid_key`
  - 402: `billing_credits`
  - 404: `invalid_model`
  - 413: `request_too_large`
  - 429: `rate_limited`
  - 500/502/503/504: provider/network unavailable
- Run-state blocks 401/402/403/404 immediately, skips 429 for the current run, and tracks request-too-large prompt/model fingerprints.

## Source Feeding Fix

Files changed:

- `backend/src/core/evidence/evidence-compressor.ts`
- `backend/src/core/generation/core-answer-prompt.ts`
- `backend/src/core/generation/core-answer-generator.ts`
- `backend/src/core/generation/prompt-budget.ts`

Implementation:

- Final source target is mode-aware and reaches 20 cards for fast/deep when available.
- `mustIncludeSourceIds` are selected first and cannot be dropped by compression.
- Minimal source cards still preserve `[Source N]`, URL, title, class, buckets, extraction provider, and at least one short evidence note.
- Prompt builder asserts included source labels and URLs before model call.
- If labels/URLs are missing, it appends a source citation appendix; if still missing, it fails before provider call.

## Prompt Compression Fix

Implementation:

- Groq fast research now targets up to 20 source cards.
- Compression reduces snippets/facts/text before dropping required source identity.
- Prompt budget reports include target citation/source-card metadata and missing must-include IDs.
- Request-too-large retry uses a higher compression level while preserving source labels and URLs.

## Citation Repair / Deterministic Cited Fallback Fix

Files changed:

- `backend/src/core/generation/core-answer-generator.ts`
- `backend/src/core/verification/citation-validator.ts`
- `backend/src/core/verification/repair-orchestrator.ts`
- `backend/src/core/pipeline/research-pipeline.ts`
- `backend/src/core/pipeline/final-status.ts`

Implementation:

- Fatal under-citation throws were replaced with:
  1. source-selection repair before generation;
  2. citation repair after generation;
  3. deterministic cited fallback if repair still under-cites.
- Deterministic fallback creates cited paragraphs from evidence cards and labels the degraded result.
- Metadata reports:
  - `degradedFallbackUsed`
  - `citationRepairAttempted`
  - `citationRepairSucceeded`
  - `deterministicCitedFallbackUsed`
  - `underCitationReason`

## Source Usage Retry / Deterministic Fast Research Fix

Files changed:

- `backend/src/core/synthesis/model-role-runner.ts`
- `backend/src/core/pipeline/research-pipeline.ts`

Implementation:

- `fast_research` uses deterministic source usage first unless `SOURCE_USAGE_ROLES_USE_MODEL=true`.
- Model source usage is bounded to selected provider unless `autoFallback=true`.
- Invalid model output gets one strict retry for the selected provider/model.
- If output is still invalid, deterministic extraction runs where allowed.
- Source usage timeout causes deterministic fallback instead of provider bouncing.

## Exa / Serper / Tavily Search Diagnostics

Files changed:

- `backend/src/core/search/search-provider-router.ts`
- `backend/src/core/search/unified-search-router.ts`
- `backend/src/core/search/providers/serper-search-provider.ts`
- `backend/src/core/search/providers/exa-search-provider.ts`
- `backend/src/core/retrieval/bucketed-retrieval.ts`

Implementation:

- Search calls log provider, query, status code, latency, result count, and error code.
- Retrieval preserves provider provenance.
- Serper and Exa are tried before Tavily fallback when configured.
- Missing keys are reported as missing, not fake healthy providers.

## Firecrawl / Jina Extraction Diagnostics

Files changed:

- `backend/src/core/search/providers/firecrawl-extractor-provider.ts`
- `backend/src/core/search/providers/jina-extractor-provider.ts`
- `backend/src/core/retrieval/source-enrichment.ts`

Implementation:

- Extraction logs status code, latency, retry-after/error code, and success.
- Firecrawl and Jina receive AbortSignals.
- Fast research enrichment has a hard budget and stops when enough strong citation-eligible sources exist.
- Snippet fallback is marked weaker and does not satisfy full-text-required buckets by itself.

## Overlapping Run Protection

Files changed:

- `frontend/src/components/chat/chat-area.tsx`
- `frontend/src/components/chat/use-chat-run-controller.ts`
- `frontend/src/components/chat/stale-event-guard.ts`
- `frontend/src/hooks/use-pipeline-state.ts`
- `backend/src/services/anthropic-service.ts`
- `backend/src/core/pipeline/research-pipeline.ts`

Implementation:

- Frontend tracks active research runs by conversation/run/assistant IDs.
- Send is disabled while a research run is active and cancellation aborts the active controller.
- Stale SSE events cannot mutate current pipeline state.
- Backend creates a request abort controller and passes the signal into the research pipeline.
- Pipeline checks abort state before search, enrichment, source usage, and generation and emits `cancelled` when aborted.

## Tests Added

Important test coverage added or updated:

- Provider errors: OpenRouter 402 billing credits, 404 invalid model, NVIDIA 403 invalid key, Groq 429 rate-limited, Gemini 502 unavailable.
- Provider health: 206 catalog fallback is display-only, not chat verified.
- Auto fallback: false blocks default chains; true allows fallback while respecting cooldown/run-state.
- Model parsing: invalid prefixes reject instead of overriding; selected Groq model is honored.
- Source feeding: 20 citation-eligible sources feed 20 cards; must-include IDs/URLs/labels survive compression.
- Generation/citation: under-cited output repairs, deterministic cited fallback runs, zero-citation completion is impossible.
- Source usage: deterministic fast path by default; retry bounded; invalid output does not bounce providers when fallback is off.
- Retrieval diagnostics: search/extraction status code logs, abort signals, budget enforcement, provenance.
- Frontend: Groq 206 models remain visible, selected Groq is not auto-reset, autoFallback defaults false and is sent, stale events are discarded, active research blocks overlapping sends.

## Verification Results

Passed:

```text
npm.cmd run typecheck --prefix backend
npm.cmd test --prefix backend
npm.cmd run build --prefix backend
npm.cmd run typecheck --prefix frontend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
npm.cmd run build
```

Backend full suite:

```text
tests 490
pass 485
fail 0
skipped 5
```

Frontend suite:

```text
tests 72
pass 72
fail 0
```

Smoke scripts passed:

```text
npm.cmd run smoke:core-research --prefix backend
npm.cmd run smoke:search-providers --prefix backend
npm.cmd run smoke:source-usage --prefix backend
npm.cmd run smoke:provider-fallback --prefix backend
npm.cmd run smoke:visible-research-output --prefix backend
npm.cmd run smoke:providers --prefix backend
npm.cmd run smoke:provider-refresh --prefix backend
npm.cmd run smoke:provider-route-semantics --prefix backend
```

Not run live:

- Saving a real Groq key and running browser-side live fast research was not executed because this workspace has no live provider/search keys configured.
- The provider/search smokes explicitly reported missing keys and did not fake success.

## Remaining Risks

- Live provider behavior still depends on real API keys, current provider uptime, account limits, and rate-limit headers.
- Frontend production bundle still emits the existing Vite large-chunk warning; build succeeds.
- Deterministic cited fallback is intentionally degraded. It prevents uncited failure when evidence exists, but it is not equivalent to a high-quality model synthesis.
- `completed_with_source_gaps` remains non-archivable by default, which is correct for archive safety but may surprise users expecting all cited output to merge automatically.

