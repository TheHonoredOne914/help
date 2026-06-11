# Frontend Phase 2 Modularization Audit

Date: 2026-05-23
Branch: `refactor/modular-files`

## Scope

Frontend-only modularization and test hardening. No backend routes, API contracts, database files, provider backend code, SourceUsageMap backend logic, backend archive logic, or backend research pipeline files were changed.

## File Classification

| File | Classification | Purpose | Real runtime usage | Imports/consumers | Known bugs | Duplicate systems | Risk | Action taken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frontend/src/hooks/use-provider-models.tsx` | frontend_runtime | React provider runtime context and refresh orchestration | Chat/settings provider model refresh and selected model state | `chat-area.tsx`, `settings-dialog.tsx`, provider runtime consumers | Pure normalization and repair logic was embedded in the hook, making provider truth rules harder to test | Duplicated with Phase 1 `use-provider-models-core.ts` | High | Extracted pure provider helpers; hook now keeps state/effects/events/orchestration |
| `frontend/src/hooks/provider-models/provider-types.ts` | frontend_runtime | Shared provider/model types and provider constants | Imported by provider hook and helper tests | provider-model helpers, hook | New file | Replaces duplicated local type declarations | Medium | Created |
| `frontend/src/hooks/provider-models/provider-status-normalizer.ts` | frontend_runtime | Provider status normalization and availability semantics | Model/status refresh path | hook, tests | Needed hard rules for catalog fallback/network/unavailable/unverified | Replaces hook-local status helpers | High | Created with strict healthy/canChat semantics |
| `frontend/src/hooks/provider-models/provider-model-normalizer.ts` | frontend_runtime | Model payload parsing, native ID normalization, dedupe, healthy research list derivation | Provider model refresh and dropdown hydration | hook, tests | Nested provider model IDs could regress if double-prefixed or stripped incorrectly | Replaces hook-local model parsing | High | Created and tested for Kimi/nested IDs |
| `frontend/src/hooks/provider-models/model-selection-repair.ts` | frontend_runtime | Single and multi-select repair | Provider model hydration and stale selection repair | hook, future chat selection repair | Multi-select repair rules were duplicated in chat area and single-select hook logic | Partially overlaps chat-area hydration effect | Medium | Created with safe fallback and dedupe behavior |
| `frontend/src/hooks/provider-models/index.ts` | frontend_runtime | Helper barrel export | Internal imports | New file | None | Low | Created |
| `frontend/src/hooks/use-provider-models-core.ts` | test_only | Backward-compatible Phase 1 pure-helper import path | Existing tests only | `use-provider-models.test.ts` | Could drift from new Phase 2 helpers | Duplicate wrapper only | Low | Re-exported from new provider-models helpers |
| `frontend/src/components/chat/chat-area.tsx` | frontend_runtime | Main chat shell, SSE ownership, optimistic state, provider hook ownership | Core chat UI | chat page | Pure request body, timeout, and stale-event logic were inline and hard to test | No runtime duplicate after extraction | High | Extracted pure helpers only; retained state/runStream/SSE ownership |
| `frontend/src/components/chat/chat-request-builder.ts` | frontend_runtime | Request body construction | `chat-area.tsx` POST body | chat-area, tests | New file | None | High | Created with parity tests |
| `frontend/src/components/chat/stream-timeout.ts` | frontend_runtime | Mode-aware stream silence budget | `chat-area.tsx` stream watchdog | chat-area, tests | New file | None | Medium | Created with parity tests |
| `frontend/src/components/chat/stale-event-guard.ts` | frontend_runtime | Run-scoped stale SSE event check | `chat-area.tsx` event loop | chat-area, tests | New file | None | High | Created with runId/assistant/conversation tests |
| `frontend/src/components/chat/research-pipeline.tsx` | frontend_runtime | Research pipeline layout orchestration | Active research UI | chat-area | Guarded pipeline panels were large inline blocks | Presentational logic duplicated inline | High | Extracted real panels and local status semantics |
| `frontend/src/components/chat/research-pipeline/status-semantics.ts` | frontend_runtime | Terminal status label/severity/success semantics | `research-pipeline.tsx`, `StatusBadge` | panel tests | Source gaps/provider errors must not look successful | Mirrors backend terminal status vocabulary | High | Created and tested |
| `frontend/src/components/chat/research-pipeline/StatusBadge.tsx` | frontend_runtime | Compact status/severity badge | Guarded pipeline header | research-pipeline | New file | None | Medium | Created |
| `frontend/src/components/chat/research-pipeline/SourceContractPanel.tsx` | frontend_runtime | Source contract and source gap display | Guarded pipeline grid | research-pipeline, tests | Source gaps needed clear warning styling and no raw JSON | Replaces inline source contract/source gap cards | High | Created and tested |
| `frontend/src/components/chat/research-pipeline/QualityGatePanel.tsx` | frontend_runtime | Quality gate display | Guarded pipeline grid | research-pipeline, tests | Failed/repair-required gate could be too easy to read as success | Replaces inline quality card | High | Created and tested |
| `frontend/src/components/chat/research-pipeline/PromptBudgetPanel.tsx` | frontend_runtime | Compact prompt budget display | Guarded pipeline grid | research-pipeline, tests | Prompt-budget debug state needed safe non-JSON rendering | Replaces inline prompt budget card | Medium | Created and tested |
| `frontend/src/components/chat/research-pipeline/ProviderRuntimePanel.tsx` | frontend_runtime | Provider runtime warnings/errors/fallback/effective models | Guarded pipeline grid | research-pipeline | Provider runtime hints were not isolated | New panel extracts event summaries | Medium | Created with secret-like redaction |
| `frontend/src/components/chat/research-pipeline/SourceListPanel.tsx` | frontend_runtime | Source list rendering boundary | Source panel area | research-pipeline | Source list rendering remained coupled to pipeline layout | Wraps existing `SourcePanel` with a runtime boundary | Medium | Created |
| `frontend/src/components/chat/research-pipeline/index.ts` | frontend_runtime | Panel barrel export | research-pipeline imports | panels | New file | None | Low | Created |
| `frontend/dev-config.test.mjs` | test_only | Configured frontend test command | `npm test --prefix frontend` | npm script | Source assertions referenced pre-Phase-2 hook internals | Source-based tests overlap TS tests | Medium | Updated assertions for new helper files |
| `frontend/src/components/chat/chat-area-modularization.test.tsx` | test_only | Phase 1/2 source modularization checks | Typechecked source test | TypeScript project | Stale guard assertions referenced old inline variable names | Source-only test | Low | Updated to check extracted guard helper |

## Runtime Paths Checked By Code Review

| Path | Frontend payload | Backend route | Selected mode/model handling | Legacy path | Final UI state risk |
| --- | --- | --- | --- | --- | --- |
| Normal mode | Built by `buildChatRequestBody` with `researchMode: undefined`, `webModels: undefined` | `/api/anthropic/conversations/:id/messages` | `normalModel` preserved | Unchanged | Request parity covered by test |
| Rhetorics mode | Built by `buildChatRequestBody` with `mode: "rhetorics"`, `rhetoricsType`, `creativity` | Same message route | Provider model config omitted as before | Unchanged | Request parity covered by test |
| Fast/Web/Deep/PhD/FullSpectrum | Built by `buildChatRequestBody` with `researchMode: mode`, active provider model, and mode model list | Same message route | Model IDs passed through unchanged | Unchanged | Request parity covered by test |
| Research streaming | `chat-area.tsx` still owns `runStream`, reader loop, optimistic updates, and dispatches | Same SSE route | Timeout helper only returns existing budgets | Unchanged | Timeout parity covered by test |
| Stale events | `isStaleRunScopedEvent` checks run, assistant, conversation identities | Same SSE route | Old run events ignored | Unchanged | Guard typechecked and tested |
| Source panel rendering | `SourceListPanel` delegates to existing `SourcePanel` | Structured metadata only | Citation source set still uses `citationStatus` before regex fallback | Unchanged | No raw JSON introduced |
| Provider settings/model refresh | Hook still owns refresh orchestration and events | Existing provider routes | Helper normalizes display versus research usability | Unchanged | Source test and helper tests cover semantics |

## Notes

- `SourceListPanel` intentionally delegates the detailed source card rendering to the existing `SourcePanel` because that component already owns citation-aware source UI. The extraction still creates a layout boundary in `research-pipeline.tsx` without duplicating source rendering logic.
- TSX component tests are included in `src` and typechecked. The current configured frontend `npm test` command runs `dev-config.test.mjs`, so the TS/TSX test files are not executed by that npm script.
