# Summary

Phase 1 modularized only the frontend chat surface. `chat-area.tsx` keeps runtime state, request construction, provider hook ownership, and streaming behavior. Pure display/routing helpers and presentational message/sidebar pieces were extracted into focused modules.

One build blocker was also fixed in `frontend/src/components/chat/sidebar.tsx`: it used the same fragile `date-fns/format` import pattern that broke the production frontend build. Both chat timestamp surfaces now use local `Intl.DateTimeFormat` helpers.

# Branch

Confirmed current branch before edits and before commit workflow: `refactor/modular-files`.

# Files Created

- `docs/backend-overhaul/modularization-audit.md`
- `frontend/src/components/chat/chat-message-list.tsx`
- `frontend/src/components/chat/chat-metadata-utils.ts`
- `frontend/src/components/chat/chat-model-routing.ts`
- `frontend/src/components/chat/chat-run-status.tsx`
- `frontend/src/components/chat/provider-model-display.ts`
- `frontend/src/components/chat/chat-area-model-routing.test.tsx`
- `frontend/src/components/chat/model-selection-hydration.test.tsx`
- `frontend/src/components/chat/chat-area-modularization.test.tsx`

# Files Changed

- `.gitignore`
- `frontend/src/components/chat/chat-area.tsx`
- `frontend/src/components/chat/sidebar.tsx`

# Old vs New Line Counts

- `frontend/src/components/chat/chat-area.tsx`: 2297 -> 1948
- `frontend/src/components/chat/chat-message-list.tsx`: 100
- `frontend/src/components/chat/chat-metadata-utils.ts`: 23
- `frontend/src/components/chat/chat-model-routing.ts`: 23
- `frontend/src/components/chat/chat-run-status.tsx`: 183
- `frontend/src/components/chat/provider-model-display.ts`: 66
- `frontend/src/components/chat/chat-area-model-routing.test.tsx`: 26
- `frontend/src/components/chat/model-selection-hydration.test.tsx`: 21
- `frontend/src/components/chat/chat-area-modularization.test.tsx`: 25

# Behavior Preservation

The extraction moved existing code into modules without moving state into child components. `chat-area.tsx` still owns conversation state, active run identity, provider hydration, selected model state, SSE parsing, and backend payload construction.

Model routing is now isolated in `chat-model-routing.ts` and preserves the required mapping:

- `normal` uses `[normalModel]`
- `fast_research` and legacy `web_search` use `webSearchModels`
- `deep_research`, `phd_level`, and `fullspectrum` use `deepResearchModels`

No backend provider contracts, SourceUsageMap validation, citation behavior, research pipeline behavior, or archive behavior were changed.

# Tests / Commands Run

- `npm.cmd install --prefix backend`: passed
- `npm.cmd install --prefix frontend`: passed after rerun with longer timeout
- `npm.cmd run typecheck --prefix frontend`: passed
- `npm.cmd test --prefix frontend`: passed, 5 tests
- focused TSX frontend tests through backend `tsx` loader: passed, 9 tests
- `npm.cmd run build --prefix frontend`: passed
- `npm.cmd run typecheck --prefix backend`: passed
- `npm.cmd run build --prefix backend`: passed
- `npm.cmd test --prefix backend`: passed, 312 passed, 5 skipped, 0 failed
- `npm.cmd run build`: passed

Notes:

- The first frontend typecheck attempt failed because dependencies were not installed in this checkout.
- The first frontend build attempt failed on `date-fns/format` resolving missing internal `.mjs` files. Removing the fragile date-fns runtime imports from chat surfaces fixed the real build path.
- Build still emits the existing Vite large chunk warning for the frontend bundle.

# Risks

- `chat-area.tsx` remains large at 1948 lines. This pass avoided deeper JSX extraction to reduce the risk of stale closures, duplicated state, or stream behavior changes.
- The added `.tsx` tests are typechecked by the frontend TypeScript command. Because the frontend package only has a `node --test dev-config.test.mjs` script, the TSX tests were run explicitly through the already-installed backend `tsx` loader.
- No browser visual smoke was run in this pass; the requested command-level verification passed.

# Next Recommended Phase

Next modularize `frontend/src/hooks/use-provider-models.tsx` by extracting pure provider status/model normalization helpers. That is safer than touching backend pipeline files and directly supports provider/model reliability without changing provider contracts.
