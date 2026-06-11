# BestDel Intelligence Desk UI Redesign

**Date:** 2026-05-02  
**Status:** Approved for planning  
**Theme direction:** `Approach B - Intelligence Desk`

## Goal

Redesign the BestDel web app so it feels like a premium legal and political intelligence tool rather than a flashy AI chat product. The result should feel clean, dense, trustworthy, and professional while preserving the current archive-driven workflow, multi-mode chat behavior, and research tooling.

## Approved product decisions

- Support `both dark and light themes` in this redesign pass.
- Make the `desktop sidebar collapsed by default`.
- Use a `hybrid` welcome layout: editorial headline plus compact action cards.
- Style the main workspace as a `blend both` experience: conversational structure with document-like density and restraint.
- Lock the visual direction to `Approach B - Intelligence Desk`.

## Design principles

- Favor trust, clarity, and editorial restraint over novelty.
- Use accent color sparingly so the interface feels premium, not gamified.
- Make archives feel like first-class workspaces, not secondary filters.
- Increase available space for model output and reduce visual chrome.
- Keep motion subtle and deliberate, with stable streaming behavior.
- Preserve current functional flows unless a UI change clearly improves them.

## Visual system

### Color palette

#### Dark theme

- App canvas: `#0A0F1E`
- Elevated surfaces: `#1A2035`
- Border tone: `#2A3450`
- Heading text: `#E8EDF5`
- Body text: `#8A94A8`
- Accent: `#4F6BED`
- Danger: `#E05A5A`

#### Light theme

- App canvas: `#F4F7FB`
- Elevated surfaces: `#FCFDFE`
- Border tone: `#D7DFEC`
- Heading text: `#162033`
- Body text: `#5F6C84`
- Accent and danger remain `#4F6BED` and `#E05A5A`

### Typography

- Primary font: `Inter` or `Geist`
- Headings: `600` weight with explicit scale hierarchy
- Body text: `400` weight with slightly dense but readable line-height
- The welcome headline "Honorable Delegate, the floor is yours." should render at roughly `32px`, `300` weight, and `0.02em` letter spacing
- Hierarchy should rely on spacing, scale, and contrast, not just boldness

### Surface treatment

- Cards, panels, modals, and composer surfaces should use restrained frosted-glass styling with `backdrop-filter: blur(...)`
- Borders should be thin, cool-toned, and consistent across shell surfaces
- Shadows should be soft and low-spread
- Remove gradient glows, neon highlights, loud banners, and playful badge styling
- Replace orange/yellow divider emphasis with thin indigo underlines where emphasis is needed

## Layout architecture

### App shell

The app shell should become a structured intelligence workspace with three stable zones:

1. Left navigation system
2. Single-line top command bar
3. Main research/chat workspace

The overall composition should maximize horizontal reading space and make the UI feel intentional and operational rather than decorative.

### Sidebar

The sidebar should be split into two conceptual layers:

- A persistent narrow `icon rail` on the far left
- A collapsible `label/archive panel` beside it

Desktop behavior:

- Sidebar starts collapsed by default
- The icon rail remains visible at all times
- The label/archive panel expands on demand

Archive presentation:

- Archive entries should render as compact cards, not plain text rows
- Each card should have a subtle left accent line or inset marker using the indigo accent
- Active states should feel selected and grounded, not brightly highlighted
- Search and archive switching should remain fast and obvious

Conversation presentation:

- Conversations should remain scannable and compact
- Active conversation emphasis should align with the new indigo accent system
- Colorful gradients and oversized emphasis markers should be removed

### Top bar

The header should become a clean single-row command bar:

- Left: refined BestDel logo/wordmark
- Center: breadcrumb or current archive context
- Right: model selector pill, system status, and archive action(s)

Status behavior:

- "AI DEGRADED" should appear as a subtle amber dot plus short label
- Avoid large warning banners unless there is a true blocking state

Model selector behavior:

- Use a compact dropdown pill
- Remove loud, multi-color chip styling in the header area

### Main workspace

The workspace should adopt a wider, calmer reading column.

Welcome state:

- Use the approved `hybrid` layout
- Editorial headline first
- Short briefing copy beneath
- Compact professional feature/action card grid below

Chat state:

- Preserve a clear message flow
- Reduce the "bubble toy" feel by moving toward flatter, document-like surfaces
- Keep enough separation so users can still track a conversation naturally

## Component design

### Feature cards

- Rounded `xl` corners
- `1px` border using the cool border token
- Monochrome SVG/lucide-style icons only
- Slight hover lift plus soft shadow
- No emoji, glow treatment, or playful decorative elements

### Input composer

The composer should become a floating bottom dock:

- Full-width within the main workspace
- Distinct from the message stack
- Ghosted or lightly elevated surface
- Subtle shadow and blur treatment

Controls:

- Mode toggles sit above the text area as minimal pills
- Send button is an indigo filled circle
- Reduce helper noise and crowded secondary controls

### Messages

- User and assistant messages should share one visual language with restrained differentiation
- Assistant outputs should prioritize reading comfort and markdown stability
- Research surfaces should feel like part of the same product family as standard chat

### Research and merge states

- Planner, merge, and synthesis states should look like premium workflow surfaces rather than diagnostic widgets
- The merge state should use a star/sparkle-style mark that feels refined, not decorative
- Status cards should share the same border, blur, and typography system as the rest of the app

## Interaction model

### Motion

- Use subtle fade, slide, and lift transitions
- Avoid glow pulses, neon shimmer, and playful elastic motion
- Keep micro-interactions crisp and low-amplitude

### Streaming

- Stream output in grouped text chunks that fade in smoothly
- Prevent line reflow and markdown jitter where possible
- Use the same streaming language across normal chat and research output

### Sidebar interaction

- Collapsed by default on desktop
- Expand/collapse should feel quick and deliberate
- The icon rail should continue to provide immediate access to main navigation affordances

### Header interaction

- Breadcrumb/archive context should update cleanly with workspace state
- Status should remain visible but quiet
- Model selection should feel secondary to the content, not visually dominant

## Scope of implementation

### Files likely to change

- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\index.css`
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\pages\chat.tsx`
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\sidebar.tsx`
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\top-header.tsx`
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\chat-area.tsx`
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\research-pipeline.tsx`
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\streaming-text.tsx`
- Potentially small supporting UI primitives if existing button, select, or dialog styling needs shared updates

### Items explicitly removed or toned down

- Large robot illustration
- Gradient glows and neon-style emphasis
- Chunky colorful badges
- Playful or childish decorative elements
- Orange/yellow highlight lines as a primary emphasis treatment

## Accessibility and usability

- Maintain sufficient contrast in both light and dark modes
- Preserve keyboard access for sidebar, archive switching, model selection, and composer controls
- Keep hover-only affordances supplemented with visible focus treatment
- Ensure collapsed sidebar still communicates navigation clearly via icons and tooltips if needed

## Error handling and edge cases

- The redesigned shell must still behave correctly when there are no archives
- Header and breadcrumb layout should gracefully handle long archive names
- The sidebar should still work on mobile using the current sheet/drawer approach, adapted to the new aesthetic
- Status indicators should degrade gracefully when health or provider metadata is unavailable
- Composer layout should remain usable across streaming, stopped streams, and empty states

## Testing strategy

### Functional verification

- Confirm archive creation, archive switching, and conversation selection still work
- Confirm the collapsed-default sidebar opens/closes correctly on desktop
- Confirm the mobile sidebar drawer still works
- Confirm model selector interactions remain functional
- Confirm welcome state, empty archive state, and active conversation state all render cleanly

### Visual verification

- Check both dark and light themes
- Check desktop widths and smaller laptop widths
- Check hover, active, focus, and degraded-status states
- Check standard chat, web search, deep research, and rhetorics surfaces for consistency

### Technical verification

- Run `npm run typecheck --prefix frontend`
- Run any focused frontend tests if present for touched UI units
- Manually inspect the running app with `npm run dev`

## Non-goals

- No backend API redesign is required for this UI pass
- No change to archive semantics, research pipeline logic, or storage model is required unless a small UI-enabling adjustment is necessary
- No additional visual gimmicks should be added to "show off" the redesign

## Handoff to planning

This spec is approved for implementation planning once the written document is reviewed by the user. The implementation plan should break the redesign into focused frontend tasks, preserve existing functionality, and verify the UI in both themes.
