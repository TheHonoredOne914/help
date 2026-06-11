# BestDel Provider Status Lies Diagnosis

## 1. Executive Summary

Settings shows providers as "invalid key" or "missing" while AI chat works because:

1. **Status probes used `/models` endpoints** which can fail (400/503) while `/chat/completions` works perfectly. A valid key was mislabeled as invalid when the model list endpoint returned transient errors.
2. **Overly broad error regex** (`/invalid/`) matched any error message containing "invalid" — including transient server errors — and labeled them `invalid_key`.
3. **No chat completions probe** — status only checked model list availability, not actual inference capability.
4. **No runtime health update** after successful chat — Settings never learned that a provider was actually working.

## 2. Runtime Flow: Settings Status

1. User types key in `SettingsDialog` → local React state `keys` (settings-dialog.tsx:158)
2. User clicks Save → `localStorage.setItem(PROVIDER_KEY, JSON.stringify(keys))` → `setSavedKeys(keys)` → dispatches `bestdel:provider-keys-updated` event (settings-dialog.tsx:193-195)
3. `refreshAllProviders(keys)` called with the saved keys (settings-dialog.tsx:196)
4. `useProviderModels.ts:242` requests `/api/providers/status?bypass=true&refresh=<timestamp>` with headers from `getProviderHeadersFromKeys(keys)`
5. Backend `provider-router.ts:157`: `extractKeys(req)` reads `x-groq-api-key` header, falls back to `process.env.GROQ_API_KEY`
6. Backend `providers.ts:327`: `probeProviderModels("groq", ...)` calls `getGroqClient(keys.groqKey).chat.completions.create(...)` — probes with a 2-token chat completion
7. Response parsed by `normalizeStatus()` → updates `providerStatus` state → Settings renders label

## 3. Runtime Flow: Successful Chat Request

1. `runStream()` sends POST to `/api/anthropic/conversations/:id/messages` (chat-area.tsx:700)
2. `apiFetch()` injects `getProviderHeaders()` which reads from `loadProviderKeys()` — current localStorage state (api-fetch.ts:26)
3. Backend `anthropic-service.ts:4332`: `const keys: RequestKeys = extractKeys(req)` — same header extraction
4. Backend `anthropic-service.ts:1318-1331`: `buildCoreProviderRouter(keys, selectedCoreModel)` registers providers with keys
5. `handleProviderAllModes()` resolves `groq/llama-3.3-70b-versatile` → `getGroqClient(groqKey)` → streams response
6. On success, `recordModelUse("groq")` called (chat-area.tsx:1046)
7. **NEW**: `bestdel:chat-provider-success` event dispatched with provider label → `useProviderModels` marks provider as `healthy: true`

## 4. Mismatch Table

| Area | Settings Status Path | Chat Request Path | Mismatch |
|---|---|---|---|
| Key source | `getProviderHeadersFromKeys(loadProviderKeys())` | `getProviderHeaders(loadProviderKeys())` | None (consistent) |
| Status probe | `/api/providers/status` → `chat.completions.create(max_tokens:2)` | `/chat/completions` → full response | **Now consistent** — both use chat completions |
| Invalid detection | `statusCodeFromError()` matches only `401|unauthorized` | Actual HTTP 401 from provider | **Fixed** — no longer matches transient errors |
| NVIDIA status | Probes `/chat/completions` with `meta/llama-3.1-8b-instruct` | Same endpoint | **Fixed** — same endpoint |
| Success update | `bestdel:chat-provider-success` event listener | Dispatches event after `recordModelUse` | **Fixed** — Settings learns from chat |
| Cache | `bypass=true` query param skips cache | No caching | **Fixed** — Refresh bypasses cache |

## 5. Root Causes From Code

### Bug 1: Model-list probe mislabeled valid keys as invalid

**File:** `backend/src/routes/providers.ts:324-327` (BEFORE)
**Function:** `buildProviderStatusPayload()` → Groq probe
**Why:** `getGroqClient(keys.groqKey).models.list()` can return 400/503 for valid keys. The catch block returned `status: statusCodeFromError(err)` which matched `/invalid/` in error messages → `invalid_key`.
**Fix:** Replaced with `groq.chat.completions.create({ max_tokens: 2 })` — probes actual inference capability.

### Bug 2: Overly broad `invalid` regex

**File:** `backend/src/routes/providers.ts:521-524` (BEFORE)
**Function:** `statusCodeFromError()`
**Why:** `/401|403|unauthorized|forbidden|invalid/` matched any error containing "invalid" — including "invalid request" (400), "invalid model" (400), etc.
**Fix:** Narrowed to `/401|unauthorized/` — only actual auth failures.

### Bug 3: Settings label chain missing `network_error` branch

**File:** `frontend/src/components/chat/settings-dialog.tsx:283-294` (BEFORE)
**Why:** `network_error` status fell through to `health?.error ?? "unavailable"` — showed raw error or "unavailable" instead of a meaningful label.
**Fix:** Added `health?.status === "network_error" ? "connected · model list unavailable"` with amber tone.

### Bug 4: `needsRefresh` used wrong variable

**File:** `frontend/src/components/chat/settings-dialog.tsx:280` (BEFORE)
**Why:** `currentConfigured && !health?.configured && !dirty` — only checked unsaved input state, not saved or health state.
**Fix:** Changed to `effectiveConfigured && !health?.configured && !dirty`.

### Bug 5: Refresh didn't bypass cache

**File:** `backend/src/routes/providers.ts:319-320` (BEFORE)
**Why:** `if (cached && cached.expiresAt > now) return cached.payload` — cache checked even with `?refresh=` param.
**Fix:** Added `bypassCache` option to `buildProviderStatusPayload()`. Route checks `req.query.bypass === "true" || req.query.refresh !== undefined`.

### Bug 6: No runtime health update after successful chat

**File:** `frontend/src/hooks/use-provider-models.ts` (BEFORE)
**Why:** After `recordModelUse("groq")`, no event updated `providerStatus` state.
**Fix:** Added `bestdel:chat-provider-success` event dispatch in chat-area.tsx and listener in use-provider-models.ts.

## 6. NVIDIA Missing Diagnosis

NVIDIA can show "missing" even when user typed a key because:

1. **Unsaved key:** User typed key but didn't Save → `savedKeys` is empty → `effectiveConfigured` was false. **Fixed:** `needsRefresh` now uses `effectiveConfigured` which includes `currentConfigured`.
2. **Model-list failure:** `/nvidia/models` returned 400/503 → `statusCodeFromError` matched "invalid" → `invalid_key` → Settings showed "invalid key". **Fixed:** Now probes `/chat/completions` instead.
3. **Status refresh timing:** `handleSave` called `refreshAllProviders(keys)` but the useEffect also fired `refreshAllProviders()` with no args (loading from localStorage). **Fixed:** Both paths now use correct keys.

## 7. Provider Status Semantics Problem

`/models` failure should NOT equal invalid key. The fix changes status probes from model-list to chat-completions, so:

- `healthy` = chat completions works
- `network_error` = chat probe failed (transient) — shown as "connected · model list unavailable"
- `invalid_key` = actual auth failure (401)
- `catalog_fallback` = configured but not yet verified

## 8. Implementation Plan For Codex

All fixes implemented. Summary of changes:

**Backend (`backend/src/routes/providers.ts`):**
- Groq probe: `models.list()` → `chat.completions.create(max_tokens: 2)`
- OpenRouter probe: `/models` → `/chat/completions` with `gpt-4o-mini`
- NVIDIA probe: `/models` → `/chat/completions` with `llama-3.1-8b-instruct`
- Gemini probe: `models.list()` → `chat.completions.create(max_tokens: 2)`
- `statusCodeFromError()`: removed `403`, `forbidden`, `invalid` from regex
- `buildProviderStatusPayload()`: added `bypassCache` option
- `/providers/status` route: checks `req.query.bypass` and `req.query.refresh`
- Added `configuredFrom`, `canChat`, `canListModels` to status payload
- Added `configuredFromSource()` helper

**Frontend (`frontend/src/components/chat/settings-dialog.tsx`):**
- `needsRefresh`: `currentConfigured` → `effectiveConfigured`
- Label chain: added `network_error` → "connected · model list unavailable"
- Tone: `network_error` → amber (not red)

**Frontend (`frontend/src/hooks/use-provider-models.ts`):**
- Status URL: `?refresh=` → `?bypass=true&refresh=`
- Added `bestdel:chat-provider-success` event listener
- `canUseReturnedCatalog`: added `network_error` status
- `ProviderRuntimeStatus`: added `configuredFrom`, `canChat`, `canListModels`
- `normalizeStatus()`: extracts new fields

**Frontend (`frontend/src/components/chat/chat-area.tsx`):**
- After successful stream: dispatches `bestdel:chat-provider-success` event with provider label

## 9. Tests To Add

### Backend tests:
1. Provider status with browser Groq key → should return `configuredFrom: "browser"`, `healthy: true`
2. Provider status with server env Groq key → should return `configuredFrom: "server_env"`
3. Model list failure but chat probe success → should return `healthy: true`, not `invalid_key`
4. Cache invalidates when key value changes
5. `?bypass=true` bypasses cache
6. `?refresh=` bypasses cache
7. NVIDIA header extraction and chat probe
8. OpenRouter env alias fallback
9. No raw key leaks in error messages

### Frontend tests:
1. Typed unsaved key shows "unsaved" label
2. Saved key triggers refresh with correct headers
3. Status uses same key as chat
4. Successful chat updates provider runtime health
5. Invalid key does not remain after valid key save
6. NVIDIA not shown missing when saved key exists

### Manual tests:
1. Enter Groq key → Save → Status changes from "checking" to "connected"
2. Send prompt → If response works, status must not remain "invalid"
3. Enter NVIDIA key → Save → Status must not say "missing"
4. Refresh should bypass cache
5. Remove key → Status becomes "missing"

## 10. Final Codex Prompt

All fixes have been implemented. The following changes were made:

1. **Provider status probes now use chat completions** (not model list) for Groq, OpenRouter, NVIDIA, and Gemini
2. **Error classification narrowed** — only 401/unauthorized = invalid_key
3. **Settings label chain** — `network_error` shows "connected · model list unavailable" (amber)
4. **needsRefresh** — uses `effectiveConfigured` instead of `currentConfigured`
5. **Refresh bypasses cache** — `?bypass=true` and `?refresh=` both skip cache
6. **Successful chat updates status** — `bestdel:chat-provider-success` event dispatched
7. **Status payload enriched** — `configuredFrom`, `canChat`, `canListModels` fields added
8. **NVIDIA chat probe** — uses `/chat/completions` instead of `/models`

Both TypeScript compilations pass with zero errors.
