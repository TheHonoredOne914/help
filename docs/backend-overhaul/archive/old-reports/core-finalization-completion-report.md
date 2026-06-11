# Core Finalization Completion Report

## Summary

The new core is now the primary final-answer path for deep research. `runResearchPipeline()` builds the agenda contract, routes archive context, generates research angles, builds EvidenceRegistryCore/EvidencePacks/ClaimGraph/SourceUsageMap, calls the core answer generator, validates citations, runs guards and the thesis quality gate, and returns final prose. Legacy synthesis remains available only as fallback.

## What Changed From Previous State

Previous state:

User query -> legacy deep-research route -> new core audit adapter -> legacy synthesis wrote final prose.

New state:

User query -> AgendaContract -> Archive Router -> Source Buckets -> EvidenceRegistry -> EvidencePacks -> SourceUsageMap -> ClaimGraph -> Core Answer Generator -> Validators -> QualityGate -> Repair -> Final Answer.

The live route now selects `corePipelineResult.finalAnswer` when core generation succeeds. The old division/mega-prompt path runs only when core generation is disabled, emergency compatibility mode is enabled, or the core path fails.

## Files Changed

- Core answer generation: `backend/src/core/generation/core-answer-generator.ts`, `backend/src/core/pipeline/research-pipeline.ts`
- Legacy fallback: `backend/src/services/anthropic-service.ts`
- Speed modes and early stopping: `backend/src/core/config/research-mode.ts`, `backend/src/core/retrieval/early-stopping.ts`
- Cache: `backend/src/services/cache-manager.ts`
- Small-model layer: `backend/src/services/small-model-orchestrator.ts`
- 30-source proof-of-use: `backend/src/core/evidence/source-usage-map.ts`, `backend/src/core/verification/thesis-quality-gate.ts`
- Archive context router and angles: `backend/src/core/archive/context-router.ts`, `backend/src/core/archive/research-angle-engine.ts`
- Provider hardening: `backend/src/core/providers/*.ts`, `backend/src/core/security/secret-redaction.ts`
- Observability: `backend/src/services/research-eval.ts`, `backend/src/services/research-telemetry.ts`
- Frontend/SSE: `frontend/src/hooks/use-pipeline-state.ts`, `frontend/src/components/chat/chat-area.tsx`, `frontend/src/components/chat/research-pipeline.tsx`
- Tests: new focused tests under `backend/tests/{archive,cache,evidence,generation,live,observability,providers,retrieval,small-model,integration}` and `backend/tests/research-mode.test.ts`

## Core Generation Flow

User query -> AgendaContract -> Archive Router -> Source Buckets -> Retrieval/preloaded sources -> EvidenceRegistry -> EvidencePacks -> SourceUsageMap -> ClaimGraph -> Core Answer Generator -> Citation Validator -> Hallucination/Legal/Electoral/Parliamentary Guards -> QualityGate -> Repair -> Final Answer.

## Speed Improvements

- `fast_research`, `deep_research`, `phd_level`, and `fullspectrum` have explicit query, source, concurrency, and repair limits.
- Early stopping checks citation-eligible counts, bucket coverage, critical buckets, and final citation feasibility.
- Cache manager supports L1 TTL reuse for search, enrichment, evidence, angles, archive routing, and quality artifacts.
- Small-model orchestration batches EvidenceCards for narrow structured tasks only.
- Targeted repair runs within per-mode repair limits.

## Small Model Strategy

Small models can classify sources, extract/compress evidence, label claims, check citation patterns, draft simple POIs/rebuttals, and extract limitations. They cannot do final thesis synthesis, final legal interpretation, final electoral integrity judgment, final hallucination audit, or final quality gate. Outputs must be strict JSON and are escalated after invalid JSON or low confidence.

## 30-Source Contract

Source usage now counts only real extraction/support usage, not source ID listing. Fake IDs fail. Legal holdings require legal source classes. PhD/full modes enforce 30 unique cited sources when enough valid sources exist, 45+ linked citations in the core generator when available, and broad bucket distribution. SourceGapReport is visible when targets cannot be met.

## Archive Context Router

- `attach_to_workspace`: core-related archive context can guide research angles.
- `create_subthread`: partially related legal/social-policy topics should branch.
- `temporary_isolated_response`: unrelated context is not injected.
- `new_workspace`: reserved for clean archive separation.

## Research Angle Engine Example

For "India democratic space 2022-2025", the engine generates angles such as constitutional freedoms vs restrictions, UAPA security vs civil liberties, FCRA regulation vs civil society restriction, internet shutdowns vs Article 19 proportionality, EVM/VVPAT allegations vs ECI/Supreme Court position, press freedom, judicial restraint, democracy index methodology, federalism, and comparative democratic backsliding.

## Tests Run

- `npm run typecheck --prefix backend`: passed.
- `npm test --prefix backend`: passed, 128 tests total, 125 passed, 3 skipped/gated live tests, 0 failed.
- `npm run build --prefix backend`: passed.
- `npm run typecheck --prefix frontend`: passed.
- `npm run build --prefix frontend`: passed with the existing non-blocking Vite chunk-size warning.
- `npm run build`: passed with the same non-blocking Vite chunk-size warning.

## Remaining Limitations

- Live search depends on provider keys, network stability, publisher availability, and rate limits.
- Paywalled sources may provide only metadata or snippets.
- Provider adapters are hardened and real HTTP-capable, but production model selection still depends on configured keys.
- The old legacy synthesis path remains in `anthropic-service.ts` for emergency compatibility and fallback risk.
- The route hub is still large and should be decomposed in a later maintainability pass.

## Final Verdict

BestDel now has the new core as the primary generation path, legacy fallback tracking, speed modes, small-model structured support, archive-safe research angles, live-path source proof-of-use logic, core division outputs, provider redaction hardening, and production observability hooks. Final verification status depends on the full command sequence run after this report.
