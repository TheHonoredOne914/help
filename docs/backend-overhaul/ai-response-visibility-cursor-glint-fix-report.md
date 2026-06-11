# AI Response Visibility, Cursor Glint, and Stale UI Cleanup

Date: 2026-05-21

## Problem

Assistant responses could render nearly invisible in the dark chat shell because the app used Tailwind `dark:` prose utilities without mounting the required `.dark` class on the document root. The welcome page also lacked the requested cursor glint interaction, and several frontend CSS/test paths contained stale duplicate or outdated definitions.

## Root Cause

The frontend is effectively dark-only through the Intelligence Desk `:root` tokens, but Tailwind dark variants are gated by `@custom-variant dark (&:is(.dark *))`. Without `<html class="dark">`, `dark:prose-invert` and `dark:text-*` utilities never activated. `CitationMessage` also had a light-mode fallback of `text-neutral-900`, which made assistant content dark-on-dark inside `#111215` bubbles.

The CSS had duplicate selector definitions for `.feature-card`, `.accent-gradient-bg`, `.assistant-fade-in > *`, and `@keyframes wandShimmer`, which made the intended Intelligence Desk styles harder to reason about. The frontend test suite also pointed at stale paths/patterns after previous provider-model refresh work.

## Files Changed

- `frontend/index.html`
- `frontend/src/components/chat/chat-area.tsx`
- `frontend/src/components/chat/cursor-glint.tsx`
- `frontend/src/index.css`
- `frontend/dev-config.test.mjs`
- `docs/backend-overhaul/FULL_REPO_BUG_AUDIT.md`

## Fix

- Added `class="dark"` to `<html>` so Tailwind dark variants activate globally.
- Made `CitationMessage` and streaming assistant bubbles use explicit `#eeeef5` / `#f0f0f5` text colors so core readability does not depend only on variant activation.
- Added a scoped `CursorGlint` component mounted only on the welcome view. It tracks pointer movement on the welcome container, throttles DOM updates with `requestAnimationFrame`, and renders a fixed radial blue glint with `pointer-events: none`.
- Revealed the character counter and keyboard hint row with a flex layout.
- Removed the duplicate footer-only `0/4000` count after the real character counter was restored.
- Removed stale duplicate CSS definitions and kept the Intelligence Desk versions as the active source of truth.
- Restored the model dropdown `avoidCollisions={false}` prop that an existing regression test required for top-side dropdown behavior.
- Updated stale frontend tests to read `use-provider-models.tsx` and assert the current cache-busted `apiFetchWithTimeout` refresh path.

## Runtime Reasoning

The user-facing assistant path renders `CitationMessage` inside assistant bubbles in `chat-area.tsx`. Global `.dark` activation fixes the root theme variant path, while explicit assistant text colors make the message readable even if a future theme wrapper changes. The welcome cursor glint is mounted only when `isWelcome` is true, so it cannot leak into active chat or research layouts. The duplicate CSS cleanup removes older conflicting definitions before the Intelligence Desk overrides.

## Verification

- `npm.cmd test` in `frontend` passed after adding the regression coverage.
- `npm.cmd run typecheck` in `frontend` passed.
- `npm.cmd run build` in `frontend` passed.
- Headless Chrome verification against the built app confirmed:
  - document root has `.dark`
  - welcome page renders
  - assistant probe text computes to `rgb(238, 238, 245)`
  - cursor glint exists and changes opacity from `0` to `1` after pointer movement
  - screenshot written to `docs/backend-overhaul/ai-response-visibility-welcome.png`

## Remaining Risk

The frontend has limited automated UI coverage. Provider-backed chat output still depends on configured API keys; this pass verifies the frontend rendering path and computed assistant text color without making a live provider call.
