# Research/Web Search Breakage Diagnosis

Date: 2026-05-18

## Reproduction

I started the backend with `npm run dev --prefix backend` and probed the live provider endpoints:

```text
/api/healthz              200 {"status":"ok","uptime":8.9185565}
/api/groq/models          400
/api/nvidia/models        400
/api/ollama/models        400
/api/openrouter/models    400
/api/gemini/models        200 {"models":[{"id":"gemini-2.5-pro", ... }]}
/api/tavily/status        200 {"status":"not_configured","message":"No Tavily API key set"}
```

Manual end-to-end mode calls could not be honestly completed in this environment because generation/search keys are not configured. The route-level behavior was traced in code and reproduced with focused backend tests using controlled provider/router inputs.

## Request Payloads

Frontend `chat-area.tsx` sends research requests to:

```text
POST /api/anthropic/conversations/:id/messages
Accept: text/event-stream
```

Normal:

```json
{"content":"...","mode":"normal","modelConfig":"standard","normalModel":"<selected model>"}
```

Rhetorics:

```json
{"content":"...","mode":"rhetorics","rhetoricsType":"speech|debate|kavita","creativity":0.5}
```

Fast Research:

```json
{"content":"...","mode":"fast_research","researchMode":"fast_research","modelConfig":"standard","normalModel":"<selected model>","webModels":["<selected research models>"]}
```

Deep Research:

```json
{"content":"...","mode":"deep_research","researchMode":"deep_research","modelConfig":"standard","normalModel":"<selected model>","webModels":["<selected research models>"]}
```

PhD Research:

```json
{"content":"...","mode":"phd_level","researchMode":"phd_level","modelConfig":"standard","normalModel":"<selected model>","webModels":["<selected research models>"]}
```

FullSpectrum:

```json
{"content":"...","mode":"fullspectrum","researchMode":"fullspectrum","modelConfig":"standard","normalModel":"<selected model>","webModels":["<selected research models>"]}
```

Legacy web search, when exposed as `web_search`, normalizes to `fast_research` in `normalizeEffectiveResearchMode()`.

## Findings

1. Normal mode bypasses the core research pipeline. It uses `handleProviderAllModes()` / provider streaming and does not run SourceUsageMap roles.
2. Rhetorics mode bypasses the research pipeline through `handleRhetorics()` and does not run SourceUsageMap roles.
3. Research mode reaches the backend as `researchMode`; the route stores `effectiveResearchMode` and passes it to `runResearchPipeline()`.
4. Source usage roles run in model mode on the core route because `anthropic-service.ts` passes `generationMode: "model"` plus a `CoreProviderRouter`.
5. Before the fix, `runSourceUsageRoles()` threw if any role had `sourceUsageFailureReport` or failed `sourceUsageRequirementSatisfied`, regardless of fast/deep/phd/full policy.
6. The validator rejection is correct: listing source IDs, titles, or weak empty items does not prove source use. `validateSourceUsageMap()` rejects those with `listing source ids without actual extraction/support does not count`.
7. The source-usage generator had retries and deterministic fallback, but provider errors could retry the same broken provider through multiple batch sizes in one run.
8. EvidenceCards could be weak because registry/card generation could preserve empty facts or use title-like fallback content.
9. Provider health was too shallow: the runner treated a registered provider as usable even when the UI model endpoint showed 400.
10. Web/fast and research were both affected because they share `runResearchPipeline()` and `runSourceUsageRoles()`.
11. Web search should map to fast policy. It should not require 30-source proof.
12. SSE HTTP 200 is expected after stream start, but the stream must emit `failed` or `completed_with_source_gaps` truthfully. The catch block already persisted failed messages for thrown `SOURCE_USAGE_VALIDATION_FAILED`; the pipeline was too eager to throw for fast/deep.
13. Frontend already had a failed toast path, but it did not show the full SourceUsageFailureReport details and it could keep stale provider selections.

## Mode Status

With missing local keys:

- Normal: route is available, but generation depends on configured provider keys.
- Rhetorics: route is available, but generation depends on configured provider keys.
- Fast Research: now uses 10-source policy and can complete with source gaps.
- Deep Research: now uses 20-source policy and can complete with source gaps when enough evidence exists.
- PhD Research: remains strict and fails if source usage cannot be proven.
- FullSpectrum: remains strict and fails if source usage cannot be proven.
- Web search: maps to fast source policy and is not blocked by a 30-source gate.
