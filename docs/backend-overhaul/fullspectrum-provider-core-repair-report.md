# Fullspectrum Provider Core Repair Report

## Summary

Fixed the core provider system so NVIDIA NIM and GitHub Models are real core research providers, not UI-only options. Added Kimi K2.6 under NVIDIA, repaired OpenRouter key resolution, added provider health/model-list refresh paths, hardened SourceUsageMap batch handling without weakening final validation, added latency budgets, smoke scripts, tests, and migration-pack cleanup.

## Diagnosis

- NVIDIA was not connected because `ProviderName` and `buildCoreProviderRouter()` only supported Groq/OpenRouter/Gemini.
- Kimi K2.6 did not appear because `/api/nvidia/models` used a static catalog without `moonshotai/kimi-k2.6`.
- GitHub Models was missing because there was no provider, model route, key extraction, UI field, or dropdown group.
- Groq/OpenRouter/NVIDIA/GitHub model lists did not refresh because key saving did not trigger model-list refetch.
- OpenRouter env naming was broken because shared extraction used `OPENROUTER_KEY` instead of the documented `OPENROUTER_API_KEY`.
- SourceUsageMap failed valid batch paths because broad final bucket coverage was applied to each small batch.
- Latency was scattered across provider, retrieval, enrichment, source usage, and generation calls.
- The source pack still had clutter because cache folders, partial dependency folders, browser profiles, and staging recursion were not excluded.

## Files Changed

- Core provider types/router: `backend/src/core/providers/provider-types.ts`, `provider-router.ts`, `model-strategy.ts`
- NVIDIA provider: `backend/src/core/providers/nvidia-provider.ts`
- GitHub provider: `backend/src/core/providers/github-provider.ts`, `backend/src/lib/github-models-client.ts`
- Model list routes/status: `backend/src/routes/providers.ts`
- Key extraction: `backend/src/lib/provider-router.ts`, `backend/src/lib/types.ts`
- Core pipeline wiring: `backend/src/services/anthropic-service.ts`, `research-pipeline.ts`, `core-answer-generator.ts`
- Source usage: `model-role-runner.ts`, `source-usage-map.ts`
- Latency: `backend/src/core/latency/latency-budget.ts`
- Frontend: `settings-dialog.tsx`, `chat-area.tsx`
- Tests: provider, latency, source usage, core routing, generation tests under `backend/tests`
- Smoke scripts: `backend/scripts/smoke-test-*.ts`
- Migration cleanup: `scripts/create-migration-pack.js`, `.gitignore`
- Env examples: `.env.example`, `backend/.env.example`

## Bug-by-Bug Verification

- NVIDIA core: `nvidia/moonshotai/kimi-k2.6` routes to `nvidia` and native `moonshotai/kimi-k2.6`. Status: verified.
- Kimi catalog: `/api/nvidia/models` fallback includes Kimi and live normalization preserves it. Status: verified.
- GitHub Models: `github/openai/gpt-4.1` routes to `github` and native `openai/gpt-4.1`. Status: verified.
- OpenRouter env: header wins, `OPENROUTER_API_KEY` works, `OPENROUTER_KEY` remains fallback. Status: verified.
- Model refresh: save event triggers refetch; unavailable providers are filtered. Status: build verified, manual real-key UI test pending.
- SourceUsageMap: final 30-source validation remains strict; 10-source batch validation no longer fails broad bucket coverage early. Status: verified.
- Latency: budgets and events exist by mode and are wired into retrieval/source usage/generation. Status: verified.
- Migration cleanup: dry run excludes `.npm-cache`, `node_modules`, `node_modules.partial_*`, dist/build/log/cache/DB/browser profile clutter. Status: verified.

## Commands Run

- `npm.cmd run typecheck --prefix backend` -> passed.
- `npm.cmd test --prefix backend ...` -> full backend suite passed: 258 tests, 253 pass, 5 skipped, 0 fail.
- `npm.cmd run typecheck --prefix frontend` -> passed.
- `npm.cmd run build --prefix backend` -> passed.
- `npm.cmd run build --prefix frontend` -> passed with existing Vite chunk-size warning.
- `npm.cmd run build` -> passed with same frontend chunk-size warning.
- `node scripts\create-migration-pack.js --dry-run` -> passed, 389 files staged, 39 excluded paths.

## Smoke Test Results

- `npm.cmd run smoke:providers --prefix backend`: all providers reported `missing_key` in this local environment.
- `npm.cmd run smoke:kimi-nvidia --prefix backend`: skipped honestly, missing `NVIDIA_API_KEY`.
- `npm.cmd run smoke:github-models --prefix backend`: skipped honestly, missing `GITHUB_MODELS_API_KEY or GITHUB_TOKEN`.
- `npm.cmd run smoke:core-research-providers --prefix backend`: provider routes reported missing keys; latency events emitted.

## Manual UI Verification

Not run with live keys in this environment. The frontend typecheck/build verifies the GitHub field, provider health panel, save event, and dropdown wiring compile. Real-key UI verification remains needed for: paste keys, save, immediate catalog refresh, select Kimi, run fast/deep research.

## Remaining Limitations

- Provider rate limits and account/region model availability can change.
- GitHub tokens need proper Models access.
- NVIDIA live catalog may change model IDs.
- Weak models can still fail JSON SourceUsageMap tasks; retries and strict failure reporting remain in place.
- Fullspectrum latency can still be high under slow search/model providers.
- Frontend bundle size warning remains pre-existing build output.
