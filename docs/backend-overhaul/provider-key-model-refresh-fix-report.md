# Provider Key + Model Refresh Fix Report

## Summary

Fixed the provider key → status → model list → selected model path so saving keys triggers an immediate provider refresh without a page reload. The frontend now has one shared provider runtime hook, and the backend no longer treats catalog fallback as proof that a provider is usable.

## Root Causes

- Keys appeared entered but status stayed checking/missing because Settings owned its own transient health state while ChatArea owned a different model-list state.
- Model lists did not reliably update after save because refresh logic was buried in ChatArea and could use stale storage reads.
- Provider status and model list state were separate, so one could show missing while the other kept stale models.
- Status cache was stale because the backend cache key only encoded whether a key existed, not which key value was supplied.
- Sequential provider checks made Settings wait for slow providers before showing other statuses.
- NVIDIA and GitHub catalog fallback could look healthy because `probeProviderModels()` marked any returned payload as healthy.
- Kimi K2.6 did not reliably appear as usable because NVIDIA fallback catalog and live NVIDIA health were not separated.
- OpenRouter/Groq refresh was unreliable because errors were swallowed and the dropdown used a simple healthy/unavailable status rather than structured provider state.

## Files Changed

Frontend provider hook:
- `frontend/src/hooks/use-provider-models.ts`

Settings dialog:
- `frontend/src/components/chat/settings-dialog.tsx`

Chat model selection:
- `frontend/src/components/chat/chat-area.tsx`

API/provider headers:
- `frontend/src/lib/provider-keys.ts`
- `frontend/src/lib/api-fetch.ts`

Backend provider status/model routes:
- `backend/src/routes/providers.ts`

Tests:
- `frontend/dev-config.test.mjs`
- `backend/tests/providers/provider-status-cache.test.ts`
- `backend/tests/providers/provider-status-parallel.test.ts`
- `backend/tests/providers/provider-status-health-semantics.test.ts`
- `backend/tests/providers/github-model-list.test.ts`

Smoke script:
- `backend/scripts/smoke-test-provider-refresh.ts`
- `backend/package.json`

Docs:
- `docs/backend-overhaul/provider-key-model-refresh-diagnosis.md`
- `docs/backend-overhaul/fullspectrum-provider-repair-implementation-log.md`
- `docs/backend-overhaul/provider-key-model-refresh-fix-report.md`

## Before / After

Before:
- Key pasted but status could stay checking/missing.
- Model dropdown did not refresh reliably.
- Provider health and model lists could disagree.
- Stale selected models could remain selected.
- Catalog fallback could look healthy.

After:
- Saving keys dispatches a detailed refresh event with current keys and `forceRefresh`.
- `useProviderModels()` refreshes provider status and all model routes.
- Model dropdown updates without reload.
- Research model dropdown opens upward from the bottom input dock.
- Invalid/missing providers clear stale models.
- Selected model is repaired to the first healthy model, preferring `nvidia/moonshotai/kimi-k2.6` when NVIDIA is healthy.
- NVIDIA/GitHub/Gemini catalogs do not fake health without validation.
- Individual model-list routes now return honest HTTP statuses for failures; the aggregate `/api/providers/status` remains a 200 health report.

## Commands Run

- `npm.cmd install` → up to date.
- `npm.cmd run install:all` → backend and frontend up to date.
- `npm.cmd run typecheck --prefix backend` → passed.
- `npm.cmd run typecheck --prefix frontend` → passed.
- `npm.cmd test --prefix frontend` → 2 passed, 0 failed.
- `npm.cmd test --prefix backend` → 258 passed, 5 skipped, 0 failed.
- `npm.cmd run build --prefix backend` → passed.
- `npm.cmd run build --prefix frontend` → passed, with existing Vite chunk-size warning.
- `npm.cmd run build` → passed, with existing Vite chunk-size warning.
- `npm.cmd run smoke:provider-refresh --prefix backend` → passed; no live keys configured locally, all providers reported `missing_key` without fake success.

Latest targeted repair verification:
- `node --import tsx --test tests/providers/provider-status-health-semantics.test.ts` -> 4 passed, 0 failed.
- `npm.cmd test --prefix frontend` -> 2 passed, 0 failed.
- `npm.cmd run typecheck --prefix backend` -> passed.
- `npm.cmd run typecheck --prefix frontend` -> passed.
- `npm.cmd run build --prefix backend` -> passed.
- `npm.cmd run build --prefix frontend` -> passed, with existing Vite chunk-size warning.
- `npm.cmd test --prefix backend` -> 259 passed, 5 skipped, 0 failed.
- `npm.cmd run build` -> passed, with existing Vite chunk-size warning.
- `npm.cmd run smoke:provider-refresh --prefix backend` -> passed; no live keys configured locally, all providers reported `missing_key` without fake success.

## Manual UI Verification

Not run in-browser in this environment. The frontend build and source-level refresh contract passed. The app should be restarted or hard-refreshed so the browser loads the new bundle.

## Remaining Limitations

- NVIDIA model availability can vary by account/region.
- GitHub Models requires the token to have Models access.
- Provider rate limits can still report `rate_limited`.
- Network outages can show `network_error` or `unverified`.
- Catalog fallback is only a display aid; it is not proof of live usability.
