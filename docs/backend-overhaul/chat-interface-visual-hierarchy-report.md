# Chat Interface Visual Hierarchy Report

Date: 2026-05-22

## Problem

The chat input dock spent too much vertical space on separate controls, kept Send and Enhance at the lower edge of the textarea, and did not resize with typed content. Message bubbles also used viewport-percentage widths, which made long outputs harder to scan on wide screens.

While verifying the patch, the frontend source test suite also exposed a stale provider-model assertion that still expected the older `canUseReturnedCatalog` expression instead of the current `availableForDisplay` path.

## Root Cause

`chat-area.tsx` treated the composer as a fixed compact row: the textarea had a low minimum height, buttons were anchored at `bottom-2`, and the helper row used a taller counter/hint layout. Message wrappers used `max-w-[90%] md:max-w-[86%] lg:max-w-[82%]` instead of a text-measure cap.

## Files Changed

- `frontend/src/components/chat/chat-area.tsx`
- `frontend/dev-config.test.mjs`
- `docs/backend-overhaul/chat-interface-visual-hierarchy-report.md`
- `docs/backend-overhaul/chat-interface-visual-hierarchy.png`

## Fix

The composer now auto-resizes between 72px and 176px, gives the textarea enough right padding for embedded controls, and places Send/Enhance at the top-right inside the input container. The helper row is tighter and keeps the character counter beside the keyboard hint. Message and streaming wrappers now use `max-w-[85ch]`, with slightly reduced vertical spacing in the scroll area and footer.

The stale provider source test now asserts the current `status.availableForDisplay ?? isDisplayAvailable(...)` model-display guard and the derived `availableForDisplay` status contract.

## Runtime Reasoning

The real user-facing chat path renders through `ChatArea`, so changing the textarea, dock buttons, helper row, and message wrappers there updates the active research, normal, and rhetorics chat surfaces without touching provider or backend logic. Auto-resize is driven by the controlled `input` state, so it also catches enhanced prompts, restored prompts, and cleared sends.

The provider test change does not loosen runtime behavior; it keeps the source test aligned with the already-present provider hook logic that separates display availability from research availability.

## Verification

- `npm.cmd test --prefix frontend`
- `npm.cmd run typecheck --prefix frontend`
- `npm.cmd run build --prefix frontend`
- `npm.cmd run build`
- `node C:\tmp\bestdel-verify-ui.cjs`

Headless Chrome verification measured an initial textarea height of 78px, a grown height of 169px, an 8px send-button top offset, 140px textarea right padding, and a compact 16x16 counter ring. The screenshot artifact is `docs/backend-overhaul/chat-interface-visual-hierarchy.png`.

## Remaining Risk

The browser check verifies the built welcome/composer surface, not a full authenticated archive conversation with persisted messages. The source test covers the message-bubble `85ch` constraint.
