# Summary

Phase 2 frontend modularization is complete. Provider-model pure helpers, guarded research pipeline panels, and safe chat-area helpers now exist with source/typechecked tests, and the required frontend, backend, and root verification commands all completed with exit code 0.

# Scope

Frontend-only.

No backend contracts changed. No backend route, provider backend, SourceUsageMap backend, backend archive, database, or `.env` files were modified.

# Files Created

- `frontend/src/hooks/provider-models/provider-types.ts`
- `frontend/src/hooks/provider-models/provider-status-normalizer.ts`
- `frontend/src/hooks/provider-models/provider-model-normalizer.ts`
- `frontend/src/hooks/provider-models/model-selection-repair.ts`
- `frontend/src/hooks/provider-models/index.ts`
- `frontend/src/hooks/provider-models/provider-status-normalizer.test.ts`
- `frontend/src/hooks/provider-models/provider-model-normalizer.test.ts`
- `frontend/src/hooks/provider-models/model-selection-repair.test.ts`
- `frontend/src/components/chat/chat-request-builder.ts`
- `frontend/src/components/chat/chat-request-builder.test.ts`
- `frontend/src/components/chat/stream-timeout.ts`
- `frontend/src/components/chat/stream-timeout.test.ts`
- `frontend/src/components/chat/stale-event-guard.ts`
- `frontend/src/components/chat/stale-event-guard.test.ts`
- `frontend/src/components/chat/research-pipeline/status-semantics.ts`
- `frontend/src/components/chat/research-pipeline/status-semantics.test.ts`
- `frontend/src/components/chat/research-pipeline/StatusBadge.tsx`
- `frontend/src/components/chat/research-pipeline/SourceContractPanel.tsx`
- `frontend/src/components/chat/research-pipeline/SourceContractPanel.test.tsx`
- `frontend/src/components/chat/research-pipeline/QualityGatePanel.tsx`
- `frontend/src/components/chat/research-pipeline/QualityGatePanel.test.tsx`
- `frontend/src/components/chat/research-pipeline/PromptBudgetPanel.tsx`
- `frontend/src/components/chat/research-pipeline/PromptBudgetPanel.test.tsx`
- `frontend/src/components/chat/research-pipeline/ProviderRuntimePanel.tsx`
- `frontend/src/components/chat/research-pipeline/SourceListPanel.tsx`
- `frontend/src/components/chat/research-pipeline/index.ts`
- `docs/backend-overhaul/frontend-phase-2-modularization-audit.md`
- `docs/backend-overhaul/frontend-phase-2-modularization-report.md`

# Files Changed

- `frontend/src/hooks/use-provider-models.tsx`
- `frontend/src/hooks/use-provider-models-core.ts`
- `frontend/src/components/chat/research-pipeline.tsx`
- `frontend/src/components/chat/chat-area.tsx`
- `frontend/src/components/chat/chat-area-modularization.test.tsx`
- `frontend/dev-config.test.mjs`
- `docs/backend-overhaul/FULL_REPO_BUG_AUDIT.md`

# Line Count Before / After

| File | Before | After | Touched |
| --- | ---: | ---: | --- |
| `frontend/src/hooks/use-provider-models.tsx` | 554 | 405 | Yes |
| `frontend/src/components/chat/research-pipeline.tsx` | 1573 | 1517 | Yes |
| `frontend/src/components/chat/chat-area.tsx` | 1948 | 1931 | Yes |
| `frontend/src/components/chat/settings-dialog.tsx` | 419 | 419 | No |
| `frontend/src/components/chat/sidebar.tsx` | 661 | 661 | No |

# Behavior Preservation

- Provider semantics preserved and hardened: `healthy` is true only when the raw payload says `healthy === true`; `catalog_fallback`, `network_error`, and `unavailable` do not become healthy.
- Research usability remains separate from displayability: research-usable means `healthy === true` or `canChat === true`; catalog models can display without becoming usable for research.
- Kimi and nested model IDs are preserved: `nvidia/moonshotai/kimi-k2.6`, `github/openai/gpt-4.1`, and `openrouter/anthropic/claude-sonnet-4.5` are not double-prefixed or stripped incorrectly.
- Request body parity preserved through `buildChatRequestBody`.
- Stream timeout parity preserved through `getStreamSilenceTimeoutMs`.
- Stale event guard preserved through `isStaleRunScopedEvent`, scoped by `runId`, `assistantMessageId`, and `conversationId`.
- Terminal status semantics preserved and made explicit: `completed_with_source_gaps` and `legacy_fallback_used` are warnings, `provider_error` and `failed` are errors, and only `completed` is success.
- Raw metadata safety preserved: extracted panels render selected fields only and do not stringify raw metadata JSON.

# Tests Added

- Provider status normalizer tests for healthy, catalog fallback, network/unavailable, canChat, and unknown status.
- Provider model normalizer tests for Groq prefixing, NVIDIA Kimi nested ID, OpenRouter nested ID, and dedupe.
- Model selection repair tests for preserving valid models, removing invalid models, dedupe, empty healthy list, mixed lists, and Kimi preference only when usable.
- Chat request builder tests for rhetorics, normal, and research request body shapes.
- Stream timeout tests for strict research, multi-model, and single-model budgets.
- Stale event guard tests for run, assistant, and conversation identity.
- Research pipeline status semantics tests for completion, source-gap, legacy fallback, provider error, failed, and cancelled states.
- TSX panel tests for prompt budget, source contract, and quality gate rendering.

# Commands Run

- `npm.cmd run typecheck --prefix frontend` - passed, exit code 0.
- `npm.cmd test --prefix frontend` - passed, exit code 0.
- `npm.cmd run build --prefix frontend` - passed, exit code 0. Vite emitted the existing large chunk warning.
- `npm.cmd run typecheck --prefix backend` - passed, exit code 0.
- `npm.cmd test --prefix backend` - passed, exit code 0. The run reported 312 passing tests and 5 skipped live/gated tests.
- `npm.cmd run build --prefix backend` - passed, exit code 0.
- `npm.cmd run build` - passed, exit code 0. Vite emitted the existing large chunk warning.

# Risks

- Browser visual smoke was not run yet.
- The configured frontend test command runs `dev-config.test.mjs`; TS/TSX unit-style tests under `src` are typechecked by `npm run typecheck --prefix frontend` but are not executed by the current `npm test --prefix frontend` script.

# Next Recommended Phase

Phase 3 backend/provider modularization: split provider health/model routing/core pipeline provider adapters into tested pure modules while preserving SourceUsageMap strictness and existing API contracts.
