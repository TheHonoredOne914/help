# Backend Overhaul Summary

BestDel now has a guarded backend core for deep research: AgendaContract, archive safety, bucketed query planning, source scoring/filtering, evidence registry, evidence cards/packs, source usage maps, claim graph checks, citation validation, hallucination/legal/electoral/parliamentary guards, quality gate, repair adapter, redacted SSE events, and frontend progress visibility.

The live route remains backward compatible. `backend/src/services/anthropic-service.ts` keeps the legacy deep-research synthesis path but now runs the new core audit pipeline for `deep_research`, emits guarded progress events, exposes the 30-source contract, and surfaces SourceGapReport/QualityGate state to the frontend.

# Root Causes Found

- Current user agenda was not a hard contract before retrieval and synthesis.
- Archive context could influence topic framing without agenda-overlap safety.
- Source planning was not bucket-contract based for Indian democratic-space research.
- Evidence, citations, and final answer quality were split across legacy helpers instead of one registry-backed contract.
- Frontend progress did not expose bucket/source-contract/quality-gate state.
- Secret redaction was not centralized for logs, SSE payloads, provider errors, and debug exports.

# Known Bugs Fixed First

- Topic drift: `buildAgendaContract` and `assertAgendaLock` now lock India democratic-space prompts to Indian Mock Parliament, India, 2022-2025, thesis depth, and forbidden drift terms.
- Archive contamination: `isArchiveContextSafeForAgenda` excludes AI/UN archive context for India democracy prompts and prevents archive-only citations.
- Weak planning: `buildBucketedQueryPlan` emits 60+ domain-specific queries across all democratic-space buckets.
- Source bucket gaps: `source-buckets.ts` defines 14 required India democratic-space buckets with minimum and ideal coverage.
- Fake citations: `validateCitations` rejects bare `[1]`, unlinked `[Source N]`, unknown source IDs, URL mismatches, and unsupported fraud proof language.
- 30-source contract: model roles fail unless they use 30 sources or a SourceGapReport exists.
- Indian Parliament mismatch: quality/framing guards reject UN-style output and require Indian parliamentary framing.
- Secret leakage: `secret-redaction.ts` and `safe-logger.ts` redact provider keys, bearer tokens, authorization headers, API keys, and nested payloads.

# Existing Test Failures

See `docs/backend-overhaul/test-failure-analysis.md`.

# New Architecture

- AgendaContract: normalizes the user query into committee system, topic type, temporal scope, source buckets, required entities, forbidden drift terms, and source-count contract.
- ArchiveSafety: checks archive overlap, excludes drift context, and marks previous model output low trust.
- SourceBuckets: defines democracy index, government, court/legal, watchdog, civic, press, digital rights, electoral, academic, media, comparative, parliamentary, legal commentary, and policy buckets.
- QueryPlanner: generates bucketed domain-first queries with phd-level volume targets and top-up policy.
- BucketedRetrieval: provides controlled retrieval result contracts, dedupe/filter coverage, weak/failed bucket reporting, and citation eligibility estimates.
- SourceScoring/Filtering/Enrichment: classify authority, reject low-quality drift sources, preserve legal precedent, and build citation-eligible enriched records.
- EvidenceRegistry: stable source IDs, citation labels/markdown, bucket coverage, citation eligibility count, and redacted debug export.
- EvidenceCards/Packs: compressed per-source cards and section/model packs, preserving at least 30 cards per model role when available.
- SourceUsageMap: each role records source IDs used and fails below the requirement.
- ClaimGraph: detects unsupported scores, ranks, fake judgments, and electoral fraud overclaims.
- Multi-model orchestration: deterministic role runner and pipeline result contract enforce the same source base across roles.
- CitationValidator: validates linked registry citations and rejects fake citation forms.
- HallucinationGuard/LegalClaimValidator/ElectoralIntegrityGuard/IndianParliamentFramingGuard: block unsupported legal/electoral/source/framing risks.
- QualityGate: scores agenda lock, Indian Parliament framing, source buckets, 30-source contract, citations, legal accuracy, electoral caution, debate utility, and strategic synthesis.
- RepairOrchestrator: targeted repair entrypoints for agenda drift, electoral caution, parliamentary framing, and related failures.
- SSE events: redacted lifecycle events for agenda, archive safety, bucket planning, evidence, model roles, citation audit, source gaps, quality gate, repairs, and final readiness.

# Files Changed

- `.env.example`
- `backend/.env.example`
- `frontend/.env.example`
- `backend/src/services/anthropic-service.ts`
- `frontend/src/hooks/use-pipeline-state.ts`
- `frontend/src/components/chat/chat-area.tsx`
- `frontend/src/components/chat/research-pipeline.tsx`
- New files under `backend/src/core/**`
- New files under `backend/tests/agenda`, `backend/tests/retrieval`, `backend/tests/evidence`, `backend/tests/verification`, `backend/tests/security`, `backend/tests/integration`, and `backend/tests/fixtures`
- `docs/backend-overhaul/repo-map.md`
- `docs/backend-overhaul/test-failure-analysis.md`
- `docs/backend-overhaul/backend-overhaul-summary.md`

# Tests Added

- `backend/tests/agenda/agenda-contract.test.ts`
- `backend/tests/agenda/archive-safety.test.ts`
- `backend/tests/retrieval/source-buckets.test.ts`
- `backend/tests/retrieval/query-planner.test.ts`
- `backend/tests/retrieval/source-scoring.test.ts`
- `backend/tests/evidence/claim-graph.test.ts`
- `backend/tests/evidence/source-volume-contract.test.ts`
- `backend/tests/verification/citation-validator.test.ts`
- `backend/tests/security/secret-redaction.test.ts`
- `backend/tests/integration/india-democracy-pipeline.integration.test.ts`
- `backend/tests/fixtures/india-democracy-sources.json`

# Commands Run

- `npm run typecheck --prefix backend`: passed.
- Targeted new core test command with 10 files: 17 passed, 0 failed.
- `npm run typecheck --prefix frontend`: passed.
- `npm run build --prefix backend`: passed.
- `npm test --prefix backend`: 101 total, 99 passed, 2 live-search tests skipped, 0 failed.
- `npm run build --prefix frontend`: passed with Vite chunk-size warning only.
- `npm run build`: passed with the same frontend chunk-size warning.

# India Democratic-Space Example

| Bucket | Raw results | Kept | Enriched | Evidence cards | Cited | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| democracy_index | fixture-backed | 5+ | 5+ | 5+ | 5+ | passed |
| government_official | fixture-backed | 5+ | 5+ | 5+ | 3+ | passed |
| court_legal | fixture-backed | 6+ | 6+ | 6+ | 3+ | passed |
| human_rights_watchdog | fixture-backed | 4+ | 4+ | 4+ | 3+ | passed |
| press_freedom | fixture-backed | 3+ | 3+ | 3+ | 2+ | passed |
| electoral_integrity | fixture-backed | 4+ | 4+ | 4+ | 3+ | passed |
| academic_research | fixture-backed | 3+ | 3+ | 3+ | 2+ | passed |
| indian_major_media | fixture-backed | 8+ | 8+ | 8+ | 4+ | passed |
| policy/comparative/parliamentary | fixture-backed | 9+ | 9+ | 9+ | 5+ | passed |

# 30-Source Contract Example

| Model role | EvidenceCards received | SourceUsageMap count | Passed? | Notes |
| --- | ---: | ---: | --- | --- |
| Agenda Architect | 30 | 30 | yes | Same registry-backed evidence base |
| Retrieval Planner | 30 | 30 | yes | Bucket coverage visible |
| Retrieval Critic | 30 | 30 | yes | Flags weak buckets |
| Evidence Extractor | 30 | 30 | yes | Builds compressed cards |
| Thesis Synthesizer | 30 | 30 | yes | Final citations registry-only |
| Citation Auditor | 30 | 30 | yes | Rejects fake citations |
| Indian Parliamentary Strategist | 30 | 30 | yes | Debate utility grounded |
| Final Quality Auditor | 30 | 30 | yes | Gate blocks weak output |

# Quality Gate Example

- Agenda lock score: 10
- Indian Parliament framing score: 10
- Source bucket score: 15
- 30-source contract score: 15
- Citation score: 15
- Evidence density score: 10
- Legal accuracy score: 10
- Electoral caution score: 10
- Debate utility score: 10
- Strategic synthesis score: 5
- Final score in fixture integration: passing threshold, no automatic failures.

# Remaining Limitations

- Live source quality depends on configured search APIs, rate limits, network stability, and publisher availability.
- Paywalled academic/legal sources may only provide metadata or abstracts.
- Some provider adapters are stable typed placeholders around the current legacy provider route, not a full provider client rewrite.
- The legacy deep-research generator still produces the final prose; the new core pipeline currently audits/enforces and streams contract state around it for compatibility.
- Frontend chunk size remains large, but build passes and this is a non-blocking Vite warning.

# Final Verdict

BestDel now has the backend core needed to prevent the India democratic-space prompt from drifting into AI-democracy or UN-style output, enforce 30-source evidence contracts in non-live tests, validate citations, expose source gaps, and present guarded Indian Mock Parliament research progress. The next production hardening step is to make the new core pipeline generate the final live answer directly instead of running as a guarded compatibility adapter beside the legacy synthesis path.
