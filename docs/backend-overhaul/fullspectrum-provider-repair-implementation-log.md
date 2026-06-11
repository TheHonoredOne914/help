# Fullspectrum Provider Repair Implementation Log

## Fix 1 - Core Provider Union and Model Normalization

Problem: Core `ProviderName` excluded NVIDIA and GitHub, so `nvidia/*` could not enter the core research pipeline.
Change: Added `nvidia` and `github` to the core provider union and kept first-slash-only model parsing.
Reasoning: The selected provider now matches the typed core router and native model IDs keep nested org prefixes.
Verification: `model-id-normalization.test.ts`, `nvidia-core-provider.test.ts`, `github-provider.test.ts`, backend typecheck.
Risk: Provider accounts may not expose every catalog model.

## Fix 2 - NVIDIA Core Provider and Kimi Catalog

Problem: NVIDIA existed only in legacy client code and Kimi K2.6 was absent from the NVIDIA catalog.
Change: Added `NvidiaProvider`, registered it in `buildCoreProviderRouter()`, added live NVIDIA model fetch with catalog fallback including `moonshotai/kimi-k2.6`.
Reasoning: Core source-usage roles and final generation can now call NVIDIA NIM through the same provider router as Groq/OpenRouter/Gemini.
Verification: NVIDIA provider/model-list tests and smoke script `smoke:kimi-nvidia` reports missing key instead of fake success.
Risk: Live NVIDIA catalog and regional access can vary.

## Fix 3 - GitHub Models Provider

Problem: GitHub Models was missing from backend, frontend settings, model dropdown, and provider health.
Change: Added `GithubProvider`, legacy GitHub OpenAI-compatible client, `/api/github/models`, frontend key field, headers, model dropdown group, and status handling.
Reasoning: `github/openai/gpt-4.1` now resolves to provider `github` and native model `openai/gpt-4.1`.
Verification: GitHub provider/model-list tests and `smoke:github-models` missing-key output.
Risk: GitHub token permissions must include Models access.

## Fix 4 - OpenRouter Env Alias

Problem: Shared key extraction ignored `OPENROUTER_API_KEY`, while other files used it.
Change: `extractKeys()` now resolves OpenRouter as header, `OPENROUTER_API_KEY`, then legacy `OPENROUTER_KEY`.
Reasoning: Server-side OpenRouter keys work consistently and old deployments remain compatible.
Verification: `openrouter-key-resolution.test.ts`.
Risk: None beyond invalid/rate-limited provider keys.

## Fix 5 - Provider Model Refresh

Problem: Model lists refreshed from `normalModel` changes, not key saves, and stale unavailable models could linger.
Change: Settings dispatches `bestdel:provider-keys-updated`; chat listens and refetches provider lists; provider status filters unhealthy providers; global banned regex removed.
Reasoning: Saving Groq/OpenRouter/NVIDIA/GitHub keys immediately updates provider catalogs without reload and no longer blocks Kimi/Moonshot/Nemotron.
Verification: Frontend typecheck/build, dropdown code includes GitHub and Kimi-capable NVIDIA list.
Risk: Manual browser verification with real keys still needed.

## Fix 6 - SourceUsageMap Batch Reliability

Problem: Valid small batches failed broad agenda bucket validation before they could merge into a final 30-source map.
Change: Broad bucket distribution enforcement now applies when `requiredCount >= 30`; final strict maps still require broad coverage.
Reasoning: Batch validation checks real extraction/support without weakening the final SourceUsageMap contract.
Verification: Existing `model role batches merge to real 30-source usage` test passes; strict listing-only and fake-source tests still pass.
Risk: Weak models can still produce invalid JSON; retry/fallback handles this.

## Fix 7 - Latency Budget

Problem: Research timeouts were scattered across retrieval, enrichment, source usage, and generation.
Change: Added `createLatencyBudget()` and wired retrieval/source-usage/generation stage events and provider call timeout budgets.
Reasoning: Each research mode now has explicit limits and emits latency events instead of hanging silently.
Verification: `latency-budget.test.ts`, backend test suite.
Risk: Fullspectrum real-world latency depends on provider/network conditions.

## Fix 8 - Provider Health and Smoke Tests

Problem: There was no unified `/api/providers/status` endpoint and smoke coverage did not prove the new provider paths.
Change: Added provider status route, safe model counts, latency metadata, missing/invalid/rate-limited/network statuses, and four smoke scripts.
Reasoning: UI and smoke scripts can distinguish missing keys from configured provider failures without leaking secrets.
Verification: `provider-status.test.ts`, smoke scripts.
Risk: Search provider health is key-presence only in this pass to avoid expensive probing.

## Fix 9 - Migration Pack Cleanup

Problem: Pure-source pack still risked carrying `.npm-cache`, partial node_modules, browser profiles, build output, logs, and DB files.
Change: Updated migration script and `.gitignore`, added dry-run output, excluded staging recursion, and cleaned up staging automatically.
Reasoning: Dry run shows only 389 files / ~2.47 MB staged with clutter excluded.
Verification: `node scripts\create-migration-pack.js --dry-run`.
Risk: Future generated folders need matching exclusions.

## Fix 10 - Settings Health Reads Unsaved Keys

Problem: The Settings provider-health panel showed `missing` while keys were visibly typed because it built headers from saved `localStorage`, not current form state.
Change: Added `getProviderHeadersFromKeys()` and made the health panel call `/api/providers/status` with the keys currently in the dialog.
Reasoning: The status panel now checks what the user is editing, while the model dropdown still refreshes from saved keys after Save.
Verification: `npm.cmd run typecheck --prefix frontend`; `npm.cmd run build --prefix frontend`.
Risk: Invalid keys still show provider errors until corrected.

## Fix 11 - Provider Key Save Uses Current Keys for Dropdown Refresh

Problem: Saving keys dispatched only a bare refresh event, and the chat model dropdown refetch read keys from a separate `localStorage` lookup. Some provider routes also relied on implicit headers instead of the just-saved form values.
Change: The settings save event now includes `{ keys }`; chat receives that event, builds provider headers from the event payload, and sends those headers to every model route: Groq, NVIDIA, Ollama, Gemini, OpenRouter, and GitHub. The settings health panel now shows current typed keys as `checking` instead of reverting to `missing` while the backend probe is pending or unavailable.
Reasoning: The runtime path no longer depends on a second storage read or an older health response. The exact values visible in the dialog are the values used for the immediate dropdown refresh.
Verification: Added `provider key save refreshes every model route with the current form keys` to `frontend/dev-config.test.mjs`; ran `npm.cmd test --prefix frontend`, `npm.cmd run typecheck --prefix frontend`, and `npm.cmd run build --prefix frontend`.
Risk: Real provider catalogs can still return invalid/rate-limit/network errors, and users must run the rebuilt frontend bundle for the patched event path to load.

## Fix 12 - Shared Provider Runtime and Truthful Health Semantics

Problem: Settings status and ChatArea model lists were still separate states, backend provider status cached only configured/missing booleans, provider probes were sequential, and catalog fallback could make NVIDIA/GitHub look healthy without live validation.
Change: Added `useProviderModels()` as the shared frontend provider runtime, moved model refresh out of ChatArea, added accurate Settings statuses with unsaved/checking/connected/invalid/rate/network/catalog/unverified states, fingerprinted backend status cache keys, concurrent provider checks, stable model-list payloads, and non-healthy catalog fallback semantics.
Reasoning: A saved key now drives one provider refresh path: headers are sent, backend checks live health, stale models are cleared when unhealthy, selected models are repaired only from healthy providers, and `nvidia/moonshotai/kimi-k2.6` remains selectable only when NVIDIA validates.
Verification: Added provider status cache/parallel/health-semantics tests, updated frontend provider hook contract test, ran backend/frontend typechecks, frontend test, full backend test suite, backend/frontend/root builds, and `smoke:provider-refresh`.
Risk: Real health still depends on provider account access, rate limits, GitHub Models permissions, and network availability.

## Fix 13 - Model Dropdown Direction and Honest Model Route HTTP Status

Problem: The research model dropdown opened downward into the input dock, and individual model-list routes returned HTTP 200 even when the JSON body said `missing_key`, `invalid_key`, `network_error`, or `catalog_fallback`. Settings could also show `missing` while a saved key was visible if the hook still held stale status.
Change: Forced the research model dropdown to open upward with Radix `side="top"`, refreshed provider state when Settings opens with loaded keys, rendered current filled key fields as `checking`/`not checked` instead of stale `missing`, and added `httpStatusForProviderStatus()` plus model-route response mapping.
Reasoning: The dropdown position now follows the intended bottom-dock layout. Individual model-list endpoints now make transport status match provider state: missing key is 400, invalid key is 401, rate limit is 429, catalog/unverified/network failures are 502, and unavailable is 503. The aggregate `/api/providers/status` can still return 200 because it is a multi-provider health report, not a single-provider model-list success.
Verification: Added frontend source contract assertions and backend status-mapping assertions. Ran `npm.cmd test --prefix frontend`, focused backend provider health semantics test, `npm.cmd run typecheck --prefix backend`, `npm.cmd run typecheck --prefix frontend`, `npm.cmd run build --prefix backend`, `npm.cmd run build --prefix frontend`, full `npm.cmd test --prefix backend`, root `npm.cmd run build`, and `npm.cmd run smoke:provider-refresh --prefix backend`.
Risk: Browser dev tools will still show 200 for `/api/providers/status` by design; check individual `/api/{provider}/models` calls for provider-specific HTTP failures.
