# BestDel Intelligence Desk UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the BestDel frontend into a premium legal/political intelligence workspace with a two-tone navy/slate system, collapsed icon-rail sidebar, refined header, hybrid welcome view, and premium composer/message surfaces while preserving current chat functionality.

**Architecture:** Keep the current React/Vite/Tailwind structure, but split the redesign into shell/navigation changes, content/composer changes, and global token/style changes. Reuse existing components and data flows, changing structure only where needed to support the new visual system and collapsed-default navigation.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS v4, Radix UI, Lucide React, TanStack Query

---

## File map

- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\index.css`
  - Theme tokens, typography, surface styles, shell primitives, motion refinements
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\pages\chat.tsx`
  - App shell composition and archive dialog surface styling hooks
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\sidebar.tsx`
  - Icon rail, collapsed/expanded desktop navigation, archive cards, conversation list styling
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\top-header.tsx`
  - Premium single-line header with breadcrumb and quiet status controls
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\chat-area.tsx`
  - Welcome layout, floating composer, mode pill layout, message shell styling, remove robot illustration
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\research-pipeline.tsx`
  - Planner/merge/synthesis card styling aligned with the intelligence desk system
- `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\streaming-text.tsx`
  - Confirm grouped fade-in styling still fits the new surface system

## Task 1: Redesign app shell, sidebar, and header

**Files:**
- Modify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\pages\chat.tsx`
- Modify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\sidebar.tsx`
- Modify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\top-header.tsx`

- [ ] Add collapsed-by-default desktop sidebar state with icon rail plus expandable label/archive panel
- [ ] Convert archive entries into compact cards with restrained indigo active treatment
- [ ] Rework the header into logo-left / breadcrumb-center / controls-right single-line layout
- [ ] Keep mobile drawer behavior working with the new shell

## Task 2: Redesign welcome state, chat workspace, and composer

**Files:**
- Modify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\chat-area.tsx`

- [ ] Replace the existing welcome hero with the approved hybrid editorial layout
- [ ] Remove the large robot illustration from the welcome state
- [ ] Rework mode controls into restrained pill toggles
- [ ] Restyle the composer as a floating bottom dock with indigo circular send button
- [ ] Shift message surfaces toward a document/chat hybrid with wider reading comfort

## Task 3: Align research surfaces and streaming presentation

**Files:**
- Modify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\research-pipeline.tsx`
- Modify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\streaming-text.tsx`

- [ ] Restyle planner, merge, and synthesis states to match the premium surface system
- [ ] Keep the sparkle/merge indicator, but make it restrained and professional
- [ ] Confirm grouped streaming fade-in still looks smooth with the new message surfaces

## Task 4: Apply shared tokens, typography, and motion polish

**Files:**
- Modify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\index.css`

- [ ] Replace the current shell tokens with the approved dark/light palette
- [ ] Switch the font stack to Inter/Geist-style system hierarchy
- [ ] Add frosted-glass shell and panel primitives
- [ ] Remove neon/gradient-heavy styles and loud badge styling
- [ ] Add refined hover, underline, status, and composer shell rules used by the updated components

## Task 5: Verify the integrated redesign

**Files:**
- Verify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\index.css`
- Verify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\pages\chat.tsx`
- Verify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\sidebar.tsx`
- Verify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\top-header.tsx`
- Verify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\chat-area.tsx`
- Verify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\research-pipeline.tsx`
- Verify: `C:\Users\ss\Downloads\bestdel-fixednew\bestdel_fixed\frontend\src\components\chat\streaming-text.tsx`

- [ ] Run `npm run typecheck --prefix frontend`
- [ ] Run `npm run build --prefix frontend` if typecheck is clean
- [ ] Inspect the running UI manually against the approved spec if time permits
