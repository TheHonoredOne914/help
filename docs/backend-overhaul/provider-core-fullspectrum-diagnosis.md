# BestDel Provider/Core Fullspectrum Diagnosis

Date: 2026-05-19

## Provider-Related Files Inspected

- `backend/src/lib/provider-router.ts`: legacy provider/model parser, API key extraction, old client routing.
- `backend/src/lib/nvidia-client.ts`: OpenAI-compatible NVIDIA NIM client, but only for legacy path before this pass.
- `backend/src/lib/openrouter-client.ts`, `backend/src/lib/groq-client.ts`, `backend/src/lib/gemini-client.ts`, `backend/src/lib/ollama-client.ts`: legacy clients.
- `backend/src/core/providers/provider-types.ts`: core provider union originally only `groq | openrouter | gemini`.
- `backend/src/core/providers/provider-router.ts`: typed core model router and JSON task retry path.
- `backend/src/core/providers/groq-provider.ts`, `openrouter-provider.ts`, `gemini-provider.ts`: core providers.
- `backend/src/core/providers/provider-health.ts`: source-usage health selection.
- `backend/src/services/anthropic-service.ts`: core research route wiring and selected model normalization.
- `backend/src/routes/providers.ts`: provider model-list routes.
- `backend/src/routes/health.ts`: older health diagnostics.
- `frontend/src/components/chat/settings-dialog.tsx`: local browser key storage and request headers.
- `frontend/src/components/chat/chat-area.tsx`: model-list fetches, provider status, model dropdown, selected model persistence.

## Model-List Routes

- Existing: `/api/groq/models`, `/api/ollama/models`, `/api/nvidia/models`, `/api/gemini/models`, `/api/openrouter/models`.
- Missing before repair: `/api/github/models`, `/api/providers/status`.
- NVIDIA before repair: static catalog only, no Kimi K2.6, no `source` marker.
- OpenRouter before repair: route used `OPENROUTER_API_KEY`, but shared extraction did not.

## API Key Extraction Paths

- `extractKeys()` read request headers and env.
- Bug: `openrouterKey` used `OPENROUTER_KEY` but not `OPENROUTER_API_KEY`.
- Missing: GitHub Models token extraction.
- Fixed precedence: header first, then primary env, then legacy alias where applicable.

## Frontend Key Settings and Model Fetch

- Settings stored provider keys in `localStorage` and injected request headers through `getProviderHeaders()`.
- Missing before repair: GitHub Models token field and headers.
- Model fetching in `chat-area.tsx` depended on `normalModel`, so saving keys did not reliably trigger refresh.
- Groq filtering used a global banned regex that also banned Kimi/Moonshot/Nemotron terms.

## Core Provider Registration

- `buildCoreProviderRouter()` only registered Groq, OpenRouter, and Gemini.
- `nvidia/*` and `github/*` could appear in UI/legacy paths but not reach source-usage roles or final answer generation in the core pipeline.
- Nested native model IDs must strip only the first provider prefix:
  - `nvidia/moonshotai/kimi-k2.6` -> `moonshotai/kimi-k2.6`
  - `github/openai/gpt-4.1` -> `openai/gpt-4.1`

## Legacy Provider Paths

- Legacy routing already supported `nvidia/*` and stripped only the first slash.
- Legacy path did not know about `github/*`.
- Core route now rejects missing configured keys honestly instead of silently falling to legacy.

## SourceUsageMap Path

- Main files: `backend/src/core/synthesis/model-role-runner.ts`, `source-usage-role-prompt.ts`, `backend/src/core/evidence/source-usage-map.ts`, `backend/src/core/config/source-usage-policy.ts`.
- Validator already rejects listing-only maps, fake IDs, weak-only maps, missing conditional fields, repeated generic claims, and insufficient validated unique sources.
- Bug found: per-batch validation used the agenda-wide bucket requirement for a 10-source batch, which caused valid batches to fail before final merging. Fixed by applying broad bucket coverage only when the required source count is 30 or more.

## Latency Timeout Paths

- Existing timeouts were scattered across provider router, retrieval search calls, enrichment calls, and source usage role calls.
- Added central latency budget manager and stage events for retrieval, source usage, and generation.

## Fallback Paths

- Core generation only falls back to legacy when explicit compatibility/fallback flags allow it.
- Source usage non-strict modes may use deterministic extraction from real EvidenceCard text; strict modes fail honestly.
- Provider fallback candidates now include NVIDIA Kimi and GitHub Models when configured.

## Source ZIP Clutter

- Existing migration script excluded `node_modules` and common build artifacts, but not `.npm-cache`, `node_modules.partial_*`, browser profiles, staging recursion, or cache dirs consistently.
- Fixed migration script dry run confirms `.npm-cache`, `backend/node_modules.partial_20260517122823`, `node_modules`, dist/build/cache/log/DB/browser profile clutter are excluded.
