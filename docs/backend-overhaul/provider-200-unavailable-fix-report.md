# Provider 200 But Unavailable Fix Report

Date: 2026-05-21

## Problem

NVIDIA and OpenRouter model routes could return HTTP 200 while the Settings panel still displayed `unavailable`.

## Root Cause

The real runtime failure was in the custom frontend dev proxy. Node's `fetch()` receives an already-decoded upstream response body, but `frontend/dev.mjs` forwarded the backend `content-encoding: gzip` and `content-length` headers unchanged. Browser/Node clients then tried to decode a body that was no longer gzip-compressed. The request still logged as HTTP 200, but `response.json()` failed on the frontend, `payload` became `null`, and the provider hook manufactured the fallback `unavailable` status.

The provider normalizer also had a weaker edge: it accepted only object-shaped model rows. If a live route, proxy, cached route, or older backend payload returned plain model IDs such as `"moonshotai/kimi-k2.6"` or nested model arrays, `normalizeModels()` could convert a usable 200 response into an empty model list.

A smaller backend inconsistency also existed in the aggregate provider-status probe: the OpenRouter route used `OPENROUTER_KEY` as the backwards-compatible env fallback, but one status probe branch accidentally checked `ROUTER_KEY`.

## Files Changed

- `frontend/dev.mjs`
- `frontend/src/hooks/use-provider-models.tsx`
- `frontend/dev-config.test.mjs`
- `backend/src/routes/providers.ts`
- `backend/tests/providers/openrouter-key-resolution.test.ts`
- `docs/backend-overhaul/FULL_REPO_BUG_AUDIT.md`

## Fix

The frontend dev proxy now strips `content-encoding`, `content-length`, and `transfer-encoding` after proxying through Node `fetch()`, so clients receive headers that match the decoded body.

`normalizeModels()` now accepts provider model objects, plain string model IDs, and common nested payload shapes such as `{ data: { data: [...] } }`, `{ models: { data: [...] } }`, and `{ items: [...] }`. Object payloads still preserve `name`, `ownedBy`, `badge`, and context-window metadata when present. String payloads become `{ id: model.trim() }`.

The OpenRouter provider-status probe now uses the same env fallback chain as the model route: `OPENROUTER_API_KEY` first, then `OPENROUTER_KEY`.

## Runtime Reasoning

The real Settings path is `Settings -> refreshAllProviders() -> frontend dev proxy -> /api/{provider}/models -> response.json() -> normalizeModels() -> statusFromSuccessfulModelRoute() -> providerStatus`. Once the proxy no longer lies about compression and a 200 response with real model IDs normalizes to a non-empty model list, `statusFromSuccessfulModelRoute()` marks that provider healthy and the Settings label becomes connected. Empty model lists, non-200 responses, invalid keys, and missing keys still remain unhealthy, so this does not fake provider health.

For server-env OpenRouter usage, the aggregate `/api/providers/status` probe and `/api/openrouter/models` now resolve keys consistently.

## Verification

- `npm.cmd test` in `frontend` passed, including the regression that requires string model IDs to be accepted.
- `node --import tsx --test tests/providers/openrouter-key-resolution.test.ts tests/providers/provider-status.test.ts tests/providers/provider-status-parallel.test.ts` in `backend` passed, including the OpenRouter env fallback status probe.
- Runtime proxy reproduction: before the proxy fix, `fetch("http://localhost:5173/api/nvidia/models")` failed with `TypeError: terminated` / `incorrect header check`; after the fix and frontend restart, Node fetch through the frontend proxy parsed JSON and returned `nvidia: http=200 status=healthy healthy=true models=119` and `openrouter: http=200 status=healthy healthy=true models=230`.

## Remaining Risk

The fix does not override real provider failures. If NVIDIA or OpenRouter returns invalid-key, rate-limit, network-error, or an empty live catalog, the UI should still show the corresponding unavailable/error state. Browser refresh is needed after this fix because the frontend process and bundle were restarted.
