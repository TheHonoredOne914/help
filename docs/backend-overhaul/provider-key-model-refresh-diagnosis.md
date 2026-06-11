# Provider Key + Model Refresh Diagnosis

Date: 2026-05-19

## Runtime Path Traced

1. User enters keys in `frontend/src/components/chat/settings-dialog.tsx`.
2. Keys are stored in `localStorage` under `ai-research:provider-keys:v1`.
3. Settings dispatches `bestdel:provider-keys-updated`.
4. `frontend/src/components/chat/chat-area.tsx` listens for the event.
5. ChatArea currently refreshes model lists inside a large local `refreshProviderModels()` callback.
6. Model list routes are `/api/groq/models`, `/api/openrouter/models`, `/api/nvidia/models`, `/api/github/models`, `/api/gemini/models`, and `/api/ollama/models`.
7. Provider status is fetched separately from `/api/providers/status`.
8. Headers are built from browser keys by `getProviderHeaders()` / `getProviderHeadersFromKeys()`.
9. Backend extracts headers in `backend/src/lib/provider-router.ts` into `RequestKeys`.
10. Backend routes in `backend/src/routes/providers.ts` call provider model APIs.
11. Frontend model arrays update separately from Settings status.
12. ChatArea builds prefixed model IDs as `provider/native-model-id`.
13. Stream requests send `normalModel` / selected deep models to `backend/src/services/anthropic-service.ts`.
14. Core routing parses provider model IDs by first slash and registers Groq, OpenRouter, Gemini, NVIDIA, and GitHub.

## Provider Mapping

| Provider | Frontend field | Header | Backend key | Model route | Core provider |
| --- | --- | --- | --- | --- | --- |
| Groq | `groqApiKey` | `X-Groq-Api-Key` | `groqKey` | `/api/groq/models` | `groq` |
| OpenRouter | `openrouterApiKey` | `X-OpenRouter-Api-Key` | `openrouterKey` | `/api/openrouter/models` | `openrouter` |
| NVIDIA | `nvidiaApiKey` | `X-Nvidia-Api-Key` | `nvidiaKey` | `/api/nvidia/models` | `nvidia` |
| GitHub Models | `githubModelsApiKey` | `X-GitHub-Models-Api-Key`, `X-GitHub-Token` | `githubToken` | `/api/github/models` | `github` |
| Gemini | `geminiApiKey` | `X-Gemini-Api-Key` | `geminiKey` | `/api/gemini/models` | `gemini` |
| Ollama | `ollamaApiKey`, `ollamaBaseUrl` | `X-Ollama-Api-Key`, `X-Ollama-Base-Url` | `ollamaKey`, `ollamaBase` | `/api/ollama/models` | legacy only |
| Tavily | `tavilyApiKey` | `X-Tavily-Api-Key` | `tavilyKey` | status only | retrieval |
| Jina | `jinaApiKey` | `X-Jina-Api-Key` | `jinaKey` | status only | retrieval |
| Brave | `braveApiKey` | `X-Brave-Api-Key` | `braveKey` | status only | retrieval |
| Serper | `serperApiKey` | `X-Serper-Api-Key` | `serperKey` | status only | retrieval |

## Root Causes

### A. Split Frontend Truth

`SettingsDialog` owns `providerHealth`, while `ChatArea` owns `groqModels`, `nvidiaModels`, `openrouterModels`, `githubModels`, `geminiModels`, and a separate `providerStatus`.

Impact: Settings can show `checking`/`missing` while the dropdown has stale or empty arrays. A key save does not have one authoritative runtime state.

### B. Status Cache Ignores Key Identity

`statusCacheKey()` only encodes whether a key exists, for example `nvidia`, not which NVIDIA key was supplied.

Impact: invalid-key status can survive after the user replaces the value with a valid key.

### C. Sequential Provider Checks

`buildProviderStatusPayload()` awaits provider probes one by one.

Impact: a slow NVIDIA/OpenRouter/GitHub check delays every other provider status and makes Settings look stuck on `checking`.

### D. Catalog Fallback Can Look Healthy

`listNvidiaModels()` returns `catalog_fallback` after live failure, and `probeProviderModels()` marks any returned payload as `healthy: true`.

Impact: Kimi can appear from catalog even when the key is invalid or the live NVIDIA check failed.

### E. GitHub Catalog Is Not Token Health

`listGithubModels()` returns the curated catalog when any token string exists.

Impact: GitHub can look configured even when the token lacks Models access.

### F. Gemini Catalog Is Not Key Health

`/api/gemini/models` returns static models without checking the key.

Impact: model availability and provider usability can disagree.

### G. Swallowed Fetch Errors

ChatArea catches model-list errors with `catch(() => {})`.

Impact: the user sees missing or empty dropdowns without a useful reason.

## Fix Direction

Create a shared frontend provider hook that owns status, model lists, selected model repair, and event/storage refresh. Backend status and model routes must return consistent semantics: catalog fallback can display names, but only live validation makes a provider healthy.
