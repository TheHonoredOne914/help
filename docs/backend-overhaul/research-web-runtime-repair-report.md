# Research/Web Runtime Repair Report

Date: 2026-05-18

## Summary

Research and Web/Fast modes were failing around the strict `SourceUsageMap` contract. The validator was correct: listing source IDs without real extraction/support must fail. The repair keeps that contract strict while making the route recover honestly: retry invalid model output, use smaller batches, skip unhealthy providers, use real EvidenceCard-based deterministic extraction only when policy allows it, and surface failed or source-gap states clearly to the frontend.

The app now installs, tests, builds, and boots locally. Live provider/search keys are missing in this environment, so live research reports provider configuration gaps instead of fake success.

## Runnability Result

```text
npm install -> pass
npm run install:all -> pass
npm run typecheck --prefix backend -> pass
npm test --prefix backend -> pass, 201 tests, 196 pass, 0 fail, 5 live-key skips
npm run build --prefix backend -> pass
npm run typecheck --prefix frontend -> pass
npm run build --prefix frontend -> pass
npm run build -> pass
npm run smoke:source-usage --prefix backend -> pass
npm run smoke:research-modes --prefix backend -> provider_config_error because live keys are missing
npm run dev -> backend 200, frontend 200
```

Provider model endpoints observed during dev boot:

```text
/api/groq/models -> 400
/api/nvidia/models -> 400
/api/ollama/models -> 400
/api/openrouter/models -> 400
/api/gemini/models -> 200
```

## Root Causes

Normal and rhetorics modes worked because they bypassed the strict research source-usage route.

Research and web modes failed because they entered the research pipeline, where `SourceUsageMap` output could contain source IDs without meaningful extracted claims, numbers, legal holdings, limitations, or supported sections.

`SourceUsageMap` validation failed correctly. The broken part was recovery and policy handling: invalid role output could fail the entire route too early, and deterministic fallback could behave like proof even when live source usage was not actually proven.

`SOURCE_USAGE_ROLES_USE_MODEL` was too important. Live research could enter deterministic mode when the env flag was absent, but synthetic source usage was disabled, producing zero valid proof and then failing. Source-usage execution now uses runtime capability first: healthy provider plus provider/router/model means model mode by default.

Web search was over-strict. It could be blocked by PhD-like source gates. Web/Fast now uses a light policy: 10 target sources, minimum 3 to proceed, source gaps allowed.

Provider health was weak. Model endpoints could return 400 while stale/default selections still attempted those providers. Research provider selection now skips unhealthy providers and reports `provider_config_error` when none are usable.

Frontend state was unclear because SSE can start with HTTP 200 even when the run later fails. The frontend now treats failed events and completed-with-source-gaps events as real run states, not success.

Citation registry sync was weak because badges could be driven by text parsing. The backend now owns citation status, and the frontend renders source badge truth from `citationStatus` when available.

Clutter remains in legacy `backend/src/lib/*` paths, but the current system status document classifies core vs legacy paths and the research route uses `backend/src/core/*`.

## Files Changed

Source usage runner:

```text
backend/src/core/synthesis/model-role-runner.ts
backend/src/core/evidence/source-usage-map.ts
```

Source usage policy and pipeline:

```text
backend/src/core/config/source-usage-policy.ts
backend/src/core/pipeline/research-pipeline.ts
```

Provider health:

```text
backend/src/core/providers/provider-health.ts
backend/tests/providers/provider-health-research.test.ts
```

Route error handling:

```text
backend/src/services/anthropic-service.ts
```

Core answer generator:

```text
backend/src/core/generation/core-answer-generator.ts
backend/tests/generation/model-backed-core-answer.test.ts
```

Frontend mode/provider UI and failed-state display:

```text
frontend/src/components/chat/chat-area.tsx
frontend/src/hooks/use-pipeline-state.ts
frontend/src/components/chat/research-pipeline.tsx
frontend/src/components/chat/source-panel.tsx
frontend/dev.mjs
frontend/build.mjs
frontend/package.json
frontend/package-lock.json
```

Citation sync:

```text
backend/tests/verification/final-citation-registry-sync.test.ts
frontend/src/components/chat/research-pipeline.tsx
frontend/src/components/chat/source-panel.tsx
```

Tests and smoke scripts:

```text
backend/tests/evidence/source-usage-live-failure-policy.test.ts
backend/tests/integration/research-web-route-recovery.test.ts
backend/tests/integration/message-route-error-state.test.ts
backend/tests/providers/provider-health-research.test.ts
backend/tests/generation/model-backed-core-answer.test.ts
backend/tests/remaining-fixes.test.ts
backend/scripts/smoke-test-source-usage.ts
backend/scripts/smoke-test-research-modes.ts
backend/package.json
```

Clutter cleanup and source ZIP hygiene:

```text
.gitignore
backend/data/.gitkeep
SETUP_ON_NEW_LAPTOP.md
docs/backend-overhaul/clutter-cleanup-diagnosis.md
docs/backend-overhaul/CURRENT_SYSTEM_STATUS.md
docs/backend-overhaul/current-runnability-diagnosis.md
docs/backend-overhaul/archive/old-reports/*
```

## Before / After

Before:

```text
Research/Web crashed on SourceUsageMap validation.
Provider endpoints returned 400 but could still be selected.
SSE could return HTTP 200 while the internal run failed.
Frontend status could look complete or unclear after failure.
Web Search could be blocked by PhD-like source requirements.
Deterministic source usage could be confused with live proof.
Source badges could rely on citation text parsing.
backend/data/chat.db was included in source packages.
```

After:

```text
Listing-only source usage still fails validation.
Invalid model source usage retries with stricter prompts and smaller batches.
Fallback provider selection respects provider health.
Evidence-based deterministic extraction uses actual EvidenceCard text only.
Web/Fast uses light source policy and can complete with source gaps.
Deep can complete with source gaps when evidence is partial but usable.
PhD/FullSpectrum remain strict and fail honestly.
Failed SSE runs emit failed state and are persisted as failed.
Completed-with-source-gaps is visible as a warning state.
Frontend uses backend citationStatus for source badges.
Runtime DB files are excluded from future source ZIPs.
```

## Important Behavioral Rules Preserved

The strict validator was not weakened.

Invalid usage still includes:

```text
sourceId only
title only
URL only
empty extractedClaim
generic repeated claims
fake source IDs
all relevant_but_weak items
legal holding from non-legal source
rank/score from non-index source
```

Counting usage still requires source-specific evidence such as extracted claims, numbers, legal holdings, limitations, supported sections, reliability notes, debate utility, or citation audit reasoning.

## Remaining Limitations

Live provider keys are required for real generation.

Live search keys are required for real retrieval.

Weak models may still produce invalid JSON, but this is now retried and surfaced honestly.

Paywalled or snippet-only sources can still produce weak EvidenceCards and SourceGapReports.

The frontend bundle remains large enough to trigger a Vite size warning.

Legacy `backend/src/lib/*` systems remain for old normal/rhetorics/fallback paths and should be retired in a later cleanup after route ownership is fully separated.

## Source Package

Clean source archive:

```text
C:\Users\HP\Downloads\BestDel\BestDel-source-runtime-repair-2026-05-18-clean.zip
```

Archive verification found no `node_modules`, `dist`, `.env`, `.log`, `.zip`, `chat.db`, `chat.db-shm`, or `chat.db-wal` entries. It includes `backend/data/.gitkeep`.
