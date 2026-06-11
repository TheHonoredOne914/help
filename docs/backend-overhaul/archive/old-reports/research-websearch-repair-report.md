# Summary

Research/web failures were caused by strict SourceUsageMap validation being applied without mode-aware recovery. The validator was correct; the runner/pipeline/provider/frontend handling around it was not. I kept the validator strict and fixed source usage recovery, provider health selection, mode policy, event reporting, frontend model defaults, and failure display.

# Root Cause

Normal and rhetorics worked because they bypass the core research SourceUsageMap pipeline. Web/research failed because `runSourceUsageRoles()` threw on any failed source-usage role for every research mode. SourceUsageMap validation failed when model output listed source IDs without source-specific extracted claims, numbers, holdings, limitations, or supported sections. Provider health made this worse because registered providers could still be selected even when `/api/*/models` returned 400. Web search was affected because it shares the core research route and source-usage roles. The frontend was unclear because stale model selections could remain and SourceUsageFailureReport details were not visible.

# Files Changed

Model-role runner:

- `backend/src/core/synthesis/model-role-runner.ts`
- Added per-run broken provider skipping, provider fallback behavior, batch retry events, and evidence-based deterministic fallback.

Source usage prompt:

- `backend/src/core/synthesis/source-usage-role-prompt.ts`
- Added schema, valid/invalid examples, one-item-per-source requirement, citation/URL/content preview fields.

Source usage policy:

- `backend/src/core/config/source-usage-policy.ts`
- Added fast/web/deep/phd/full policy with required sources, minimums, strictness, deterministic fallback, and role count.

Provider health:

- `backend/src/core/providers/provider-health.ts`
- Added health filtering for 400 model endpoints, missing config, JSON task support, and fallback selection.

Evidence cards:

- `backend/src/core/evidence/evidence-pack-builder.ts`
- `backend/src/core/evidence/evidence-registry.ts`
- Improved facts, numbers, legal holdings, limitations, and content preview extraction.

Research pipeline:

- `backend/src/core/pipeline/research-pipeline.ts`
- Applied mode policy, added source usage events, allowed fast/deep source-gap completion, kept PhD/FullSpectrum strict.

Route error handling:

- `backend/src/services/anthropic-service.ts`
- Terminal status now distinguishes strict failures from non-strict source gaps and includes source usage reports.

Frontend:

- `frontend/src/components/chat/chat-area.tsx`
- Removes stale unavailable model defaults, prefers healthy Gemini when available, disables research if no healthy model is available.
- `frontend/src/components/chat/research-pipeline.tsx`
- Shows SourceUsageFailureReport details in failed state.
- `frontend/build.mjs`
- Builds with the same Vite settings while bypassing the Windows sandbox config-loading failure.

Tests and smoke:

- `backend/tests/evidence/source-usage-live-failure-policy.test.ts`
- `backend/tests/providers/provider-health-research.test.ts`
- `backend/tests/integration/research-web-route-recovery.test.ts`
- `backend/scripts/smoke-test-research-modes.ts`
- `backend/package.json`

# Before / After

Before:

- Research/web could crash on strict SourceUsageMap validation.
- Provider endpoints returned 400, but stale/broken providers could still be selected.
- Web search could be blocked by strict source-usage failure handling.
- Frontend errors did not expose the failure report clearly.

After:

- Listing-only SourceUsageMap still fails.
- Model output retries with stricter prompt and smaller batches.
- Broken provider is skipped in the same run and healthy fallback can be selected.
- Deterministic fallback uses only EvidenceCard facts/numbers/legal holdings/debate text and marks weak cards as weak.
- Fast/web can complete with SourceGapReport.
- Deep can complete with source gaps when usable.
- PhD/FullSpectrum fail honestly if source proof cannot be satisfied.
- Frontend avoids stale unavailable providers and displays source usage failure details.

# Commands Run

```text
node --import tsx --test tests/evidence/source-usage-live-failure-policy.test.ts tests/providers/provider-health-research.test.ts
11 tests passed
```

```text
npm run typecheck --prefix backend
tsc -p tsconfig.json --noEmit
exit 0
```

```text
npm run typecheck --prefix frontend
tsc --noEmit
exit 0
```

```text
node --import tsx --test tests/evidence/source-usage-live-failure-policy.test.ts tests/providers/provider-health-research.test.ts tests/integration/research-web-route-recovery.test.ts
13 tests passed
```

```text
npm test --prefix backend
196 tests: 191 passed, 5 skipped live-key tests, 0 failed
```

```text
npm run build --prefix backend
exit 0
```

```text
npm run build --prefix frontend
Vite production build completed
```

```text
npm run build
Backend and frontend production builds completed
```

```text
npm run smoke:research-modes --prefix backend
Provider health: no healthy providers because GEMINI_API_KEY, GROQ_API_KEY, and OPENROUTER_API_KEY are missing
Search key status: Tavily/Brave/Serper/Jina not configured
Result: exited 1 with visible provider configuration errors, not fake success
```

Live endpoint probe while backend dev server was running:

```text
/api/healthz              200
/api/groq/models          400
/api/nvidia/models        400
/api/ollama/models        400
/api/openrouter/models    400
/api/gemini/models        200
/api/tavily/status        200 not_configured
```

# Remaining Limitations

- Local `.env` keys are missing, so full live manual generation/search could not be honestly completed here.
- Tavily/search is not configured; live web retrieval will show provider configuration/source-gap behavior until a search key is added.
- Weak models can still fail structured JSON; the runner now retries/falls back instead of faking success.
- Source extraction quality depends on snippets/full text returned by retrieval providers.
- Rate limits and paid provider availability can still affect live runs.
