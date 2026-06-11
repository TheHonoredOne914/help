# Fast Research Live Smoke Repair

## Problem
Fast research could produce provider logs and partial evidence, but live runs still failed or returned too-short answers. The observed failures included Firecrawl extraction unavailability, Groq `request_too_large`, failed terminal status despite a source-backed deterministic citation fallback, and a sub-1000-word response.

## Root Cause
The fast research path had four real runtime problems:

- The live smoke required Firecrawl specifically even though the runtime can continue with another extraction provider.
- Groq prompt budgets used catalog-style context assumptions instead of the live account tier, so oversized prompts were sent and rejected.
- The terminal status decider did not distinguish evidence-backed deterministic citation fallback from legacy fallback or real failure.
- The final answer prompt did not enforce a user-requested 1000-word minimum strongly enough.

## Files Changed
- `backend/scripts/smoke-test-live-fast-research.ts`
- `backend/src/core/generation/core-answer-prompt.ts`
- `backend/src/core/generation/prompt-budget.ts`
- `backend/src/core/pipeline/final-status.ts`
- `backend/src/core/pipeline/research-pipeline.ts`
- `backend/src/core/providers/limits/provider-limit-registry.ts`
- `backend/tests/generation/core-answer-prompt-budget.test.ts`
- `backend/tests/pipeline/final-status-decision.test.ts`
- `backend/tests/providers/limits/prompt-budget-gate.test.ts`

## Fix
The smoke test now validates live provider prerequisites without hard-requiring Firecrawl; it requires healthy search providers plus at least one healthy extractor. It also prints compact diagnostics for terminal status, source usage, quality gate, and citation state.

Prompt budgeting now treats over-safe-budget prompts as local compression failures before spending a provider call. Groq `gpt-oss` fast research budgets are capped to the observed live tier, and NVIDIA/Kimi fast prompts respect the local safe input budget. The output contract now explicitly preserves a user-requested 1000-word minimum.

The terminal status decider now returns `completed_with_source_gaps` for non-legacy, evidence-backed deterministic cited fallback only when citations exist, the source contract passes, and no fatal quality/source-usage failure is present.

## Runtime Reasoning
This fixes the actual fast research path because `runResearchPipeline()` passes `deterministicCitedFallbackUsed` from `generateCoreResearchAnswer()` into `decideRunTerminalStatus()`, and the live smoke uses the same provider router, status payload, retrieval, enrichment, generation, quality gate, and terminal-state logic as the backend runtime path.

Provider health remains honest: Firecrawl 402/unavailable and Jina 403/422/timeout calls are logged as failed provider calls. The run is not marked as normal success when source usage and source diversity are weak; it is reported as `completed_with_source_gaps`.

## Verification
- `node --import tsx --test tests\generation\core-answer-prompt-budget.test.ts tests\generation\prompt-budget-compression.test.ts tests\providers\limits\prompt-budget-gate.test.ts tests\pipeline\final-status-decision.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run smoke:live-fast-research` with live provider keys from `C:\Users\HP\Documents\api keys.docx`

Live smoke result:

- terminal status: `completed_with_source_gaps`
- word count: `1479`
- legacy fallback: `false`
- model: `groq/openai/gpt-oss-120b`
- output: `backend/live-fast-research-answer.md`

## Remaining Risk
The run still reports source gaps: source usage roles failed to ground enough distinct source IDs, final citations used only two unique sources in the latest live run, and source class diversity remained below target. Firecrawl returned 402/unavailable, and Jina intermittently returned invalid-key/unavailable/timeout responses. These are honest degraded states, not hidden success.
