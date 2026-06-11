# Core Finalization Plan

## Current State

BestDel already has the guarded core modules under `backend/src/core/**`: AgendaContract, archive safety, bucketed query planning, source filtering/scoring, EvidenceRegistryCore, EvidencePacks, ClaimGraph, citation validation, hallucination/legal/electoral/parliamentary guards, quality gate, repair orchestration, provider abstractions, and SSE event helpers.

The live deep-research route is `backend/src/services/anthropic-service.ts`. Before this finalization, it called `runResearchPipeline()` for deep research and streamed core audit state, but it discarded `coreResult.finalAnswer`. The final prose was still produced by the legacy division pipeline, `mergeWithClaude()`, `synthesizeWithRoleHeadings()`, Gemini expansion, and citation repair fallback passes.

## Legacy Bypass Points

- `anthropic-service.ts` invoked `runResearchPipeline()` around line 3570 only as an adapter.
- `runDivisionPipeline()` then overwrote the final answer for deep research.
- If division synthesis failed, the route fell back to `mergeWithClaude()`.
- If that failed, Groq direct synthesis and aggregated bullet fallback could still write final prose.
- Post-processing validators ran after legacy prose, but the new core was not the primary author.

## Existing Core Coverage

- Fixture integration covered agenda lock, source bucket coverage, EvidencePacks, 30-source role usage, citation validation, and thesis quality gate.
- Security tests covered secret redaction.
- Provider router tests existed only for simple registration/dispatch behavior.
- Live tests were gated by external search keys and skipped by default.

## Provider Placeholder Findings

`backend/src/core/providers/groq-provider.ts`, `openrouter-provider.ts`, and `gemini-provider.ts` were typed placeholders that returned empty content. They needed safe request/response metadata, timeout-aware router handling, redacted provider errors, usage metadata, and injectable fetch support for tests.

## Required Migration

1. Add explicit research modes and source/repair limits.
2. Move final answer construction into a core generator that consumes EvidencePacks, ClaimGraph, SourceUsageMap, CitationValidator, guards, QualityGate, repairs, SourceGapReport, archive routing, and research angles.
3. Keep legacy synthesis as fallback only when core generation is disabled, fails, times out, a provider is unavailable, or emergency compatibility mode is enabled.
4. Enforce live-path source usage rather than fixture-only source volume.
5. Add archive routing and research angle generation so archives guide research without poisoning unrelated chats.
6. Add frontend visibility for mode, archive routing, angles, source gaps, quality gate, source contract, and fallback.
7. Add observability records that distinguish core generation from fallback.

## Migration Risks

- `anthropic-service.ts` is still the largest compatibility hub, so route changes must be narrow.
- Old and new evidence registries coexist; the live core generator uses EvidenceRegistryCore.
- Existing SSE keys must remain compatible; new events must be additive.
- Fixture source IDs must stay aligned with final citations.
- Live search quality remains dependent on external providers and rate limits.

## Implementation Steps

1. Add failing tests for modes, early stopping, cache, small model worker, source usage, archive routing, angles, provider router, core generation, division integration, observability, and gated live behavior.
2. Implement `ResearchMode`, `RESEARCH_LIMITS`, and early stopping.
3. Implement cache manager, small-model orchestrator, research eval/telemetry, archive router, and angle engine.
4. Harden provider router and provider adapters with typed metadata, timeouts, and redaction.
5. Replace SourceUsageMap with validation that counts only extracted/supporting usage.
6. Add `core-answer-generator.ts` and refactor `runResearchPipeline()` so core generation is primary.
7. Update `anthropic-service.ts` to stream/persist core output when core succeeds and use legacy synthesis only as fallback.
8. Add frontend state and cards for mode, archive routing, research angles, fallback, source contract, source gaps, and quality gate.
9. Run targeted tests, backend/frontend typechecks, full backend test suite, backend/frontend builds, and root build.
