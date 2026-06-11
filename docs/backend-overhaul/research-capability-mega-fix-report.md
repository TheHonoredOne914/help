# Research Capability Mega Fix Report

## Root Cause Summary

BestDel's research runtime had drifted into several contradictory paths: provider/model defaults were partly static and stale, normal/rhetorics/drafting could answer current facts from model memory, research modes could bypass the evidence pipeline, retrieval generated generic topic-free queries, extraction could overrun budgets, and prompt assembly could risk raw evidence dumps instead of deterministic source cards. Frontend status semantics also had insufficient distinction between completed, source gaps, degraded fallback, provider errors, and legacy fallback.

The stabilization pass fixes the runtime path rather than masking failures: research modes now prefer the evidence pipeline, provider errors remain typed, source/citation eligibility remains strict, source gaps stay visible, and live-key-only smoke items are documented as blocked rather than treated as local success.

## Provider Routing Fixes

- Removed stale OpenRouter Claude 3.5 and Gemini 1.5 fallback/default selection from model strategy and generation candidate routing.
- Added `invalid_model` as a first-class provider status/error state and mapped model/provider 404-style failures to it.
- Updated run-state so invalid models, rate limits, request-too-large combinations, repeated timeouts, and repeated failures are skipped across fast, deep, phd, and full modes.
- Guarded model generation so a missing `providerRouter` throws a typed configuration error instead of null-reference fallback.
- Expanded provider health semantics with `canChat`, `canListModels`, `liveModelListVerified`, `catalogFallbackOnly`, `healthy`, `recentlyFailed`, `rateLimited`, and `invalidModel`.

## Freshness Routing Fixes

- Added deterministic freshness detection in `backend/src/core/freshness/freshness-router.ts` for latest/current/today/recent/current-office/conflict/election/legal/current-affairs wording.
- Normal, rhetorics, and drafting modes now auto-route freshness-sensitive factual prompts to the evidence-backed fast research path.
- Temporal scope inference now biases current-event queries to the current year even without an explicit year, while keyword extraction preserves important years and named entities.

## Research Mode Routing Fixes

- `web_search`, `fast_research`, `deep_research`, `phd_level`, and `fullspectrum` route through `runResearchPipeline` as the primary evidence path.
- Legacy multi-search fallback is explicit fallback/degraded behavior, not silent normal success.
- Terminal pipeline events are emitted once with one of the truthful final states: `completed`, `completed_with_source_gaps`, `degraded_fallback`, `provider_error`, `failed`, or `cancelled`.

## Source Bucket / Query Planner Fixes

- Added topic-specific bucket plans for constitutional law, security policy, economic policy, federalism, social policy, electoral policy, foreign policy, and generic Indian Parliament topics.
- Replaced static generic query templates with agenda-aware `{agenda}` templates.
- Preserved important years and named entities, added current-year variants when freshness is needed, and deduped repeated/malformed query variants.
- Search top-up queries are provider-aware: `site:` is kept for Serper/Brave-style providers and converted to domain phrasing for Tavily/Exa.

## Search / Retrieval Fixes

- URL canonicalization and dedupe preserve meaningful legal/research-domain parameters while stripping tracking noise.
- Content dedupe now considers normalized title, longer snippets, and full-text excerpts with a fast normalized-title near-duplicate pass.
- Source scoring penalizes unknown snippet-only sources more strongly and boosts official/court/government/current-event sources where appropriate.
- Bucketed retrieval now wires early stopping once enough citation-eligible evidence and bucket coverage exist.
- Reranking precomputes source scores once instead of recalculating inside the comparator.

## Extraction / Crawler Fixes

- Source enrichment now uses `@mozilla/readability` with `linkedom` before regex fallback.
- Regex fallback strips common boilerplate and caps readable text at 8,000 characters.
- Extraction quality uses density/confidence instead of treating long noisy text as high quality.
- Firecrawl requests markdown only.
- Enrichment uses mode-aware budgets, propagates outer `AbortSignal`, aborts in-flight work when the budget expires, and uses shorter fast-research per-source timeouts.
- `fullTextRequired` buckets demote snippet-only or low-quality extraction to weak/non-strong citation status.
- A central outbound URL policy blocks non-http schemes, localhost, private/link-local IPs, and metadata hosts before extraction.

## Evidence Compression Fixes

- Deterministic evidence compression preserves source IDs, source metadata, reliability, extraction quality, citation strength, freshness, key facts, key numbers, legal holdings, snippets, and limitations.
- Mode budgets keep fast packs small, deep packs moderate, and phd/full packs larger but compressed.
- Prompt construction uses compressed evidence cards when over budget and keeps mapping back to original source IDs.
- Source selection drops by score and bucket diversity rather than random truncation.

## Prompt Budget Fixes

- Token estimation was made more conservative than `chars / 4` with a safety multiplier.
- Provider-specific margins avoid prompt overrun.
- Groq prompt budgeting now allows larger safe budgets for `llama-3.3-70b-versatile` instead of an old 8k-style cap.

## Source Contract Fixes

- Title-only and snippet-only sources are no longer strong citation evidence.
- SourceUsageMap validation still requires real extracted/supporting evidence and rejects fake/title-only usage.
- Deterministic source-usage role minimums are mode-aware and based on available evidence.
- PhD/full strictness can return `completed_with_source_gaps` for near-threshold strong evidence instead of empty failure, while zero/near-zero evidence still fails.

## Citation / Hallucination Fixes

- Citation thresholds are mode-aware and based on unique source coverage, not a hardcoded 30 linked citations.
- Repeated citation spam remains a warning/failure path where appropriate.
- Number validation checks structured `keyNumbers` with normalized percentages/decimals/commas instead of broad text inclusion.
- Article claims require nearby legal/official/parliamentary/court support for the specific Article number.
- Citation repair remains constrained to original source IDs and preserves source gap reporting.

## Fallback / Final Status Fixes

- `completed_with_source_gaps` injects a standardized source limitation notice after generation when gaps exist.
- `legacy_fallback_used`, `degraded_fallback`, provider errors, and normal completion are semantically distinct.
- Fast research provider-chain exhaustion produces a non-empty degraded fallback answer with provider failure and source-gap metadata when retrieval succeeded.
- Deep/phd/full emit explicit terminal failure/provider events instead of silent HTTP-200 success semantics.

## Security Fixes

- Extraction URL validation allows only safe HTTP/HTTPS public targets and rejects metadata/internal/private targets.
- Chart CSS generation sanitizes color values and chart keys before `dangerouslySetInnerHTML`.
- Safe color formats remain allowed: hex, rgb/rgba, hsl/hsla, and safe CSS var tokens.

## Tests Added

- `backend/tests/providers/openrouter-free-first-routing.test.ts`
- `backend/tests/providers/provider-invalid-model-skip.test.ts`
- `backend/tests/providers/provider-run-state-failure-skip.test.ts`
- `backend/tests/retrieval/topic-specific-buckets.test.ts`
- `backend/tests/retrieval/current-freshness-routing.test.ts`
- `backend/tests/retrieval/enrichment-budget-abort.test.ts`
- `backend/tests/retrieval/full-text-required.test.ts`
- `backend/tests/evidence/evidence-compressor.test.ts`
- `backend/tests/evidence/evidence-eligibility.test.ts`
- `backend/tests/generation/prompt-budget-compression.test.ts`
- `backend/tests/generation/openrouter-stale-model-regression.test.ts`
- `backend/tests/pipeline/research-mode-routing.test.ts`
- `backend/tests/pipeline/source-gap-completion.test.ts`
- `backend/tests/pipeline/research-terminal-events.test.ts`
- `backend/tests/verification/citation-threshold-mode-aware.test.ts`
- `backend/tests/verification/hallucination-number-support.test.ts`
- `frontend/src/components/ui/chart.test.tsx`

## Verification Results

- Focused backend/provider/retrieval/evidence/generation/pipeline/verification regressions were run during implementation; failing source-contract, source-usage, full-text, citation, and live-retrieval regressions were fixed and rerun successfully.
- `npm.cmd run typecheck --prefix backend`: passed.
- `npm.cmd test --prefix backend`: passed, 417 tests, 412 pass, 5 skipped live-search tests, 0 failures.
- `npm.cmd run build --prefix backend`: passed.
- `npm.cmd run typecheck --prefix frontend`: passed.
- `npm.cmd test --prefix frontend`: passed, dev-config tests plus 69 source tests, 0 failures.
- `npm.cmd run build --prefix frontend`: passed with the existing Vite chunk-size warning only.
- `npm.cmd run build`: passed with the same existing Vite chunk-size warning only.

## Remaining Risks

- Manual smoke tests that require live provider/search API keys and a running app are blocked locally unless keys and services are available.
- Provider catalog behavior depends on external OpenRouter/Gemini/Groq/GitHub/NVIDIA availability; local tests verify routing/fallback semantics, not third-party uptime.
- Existing dirty/untracked repo state includes prior work and local DB/log/cache files; this report tracks the research capability stabilization pass, not unrelated cleanup.

## Required Bug Matrix

| id | bug | files touched | fix summary | test | verification status | remaining risk |
| --- | --- | --- | --- | --- | --- | --- |
| P1-01 | Stale OpenRouter Claude 3.5 IDs could be selected | generation/provider files | Filtered deprecated OpenRouter Claude 3.5 IDs from generation candidates and defaults | `openrouter-stale-model-regression.test.ts` | fixed; focused test passed | User-supplied stale ID still needs live fallback availability |
| P1-02 | OpenRouter fallback did not prefer live free catalog | provider/generation files | Candidate routing prefers catalog/free models and excludes failed stale IDs | `openrouter-free-first-routing.test.ts` | fixed; focused test added | Live catalog unavailable becomes explicit fallback/degraded path |
| P1-03 | No typed invalid model error | provider errors/status files | Added `invalid_model` status/error semantics | `provider-invalid-model-skip.test.ts` | fixed; focused test added | Provider text matching may need new vendor messages over time |
| P1-04 | 404/model-not-found mapped generically | provider route/contract files | 404/provider-not-found/model-not-found map to `invalid_model` | `provider-invalid-model-skip.test.ts` | fixed; focused test added | External providers may use nonstandard bodies |
| P1-05 | Invalid model retried in same run | `provider-run-state.ts` | Exact invalid provider/model is skipped immediately | `provider-invalid-model-skip.test.ts` | fixed; focused test added | Cross-run cooldown remains policy-driven |
| P1-06 | Rate limits did not cool provider/model consistently | provider run-state/health files | Rate-limited provider/model cooldown is tracked and surfaced | `provider-run-state-failure-skip.test.ts` | fixed; focused test added | Real provider reset windows vary |
| P1-07 | Request-too-large retried same prompt/model combo | provider run-state files | Oversized prompt/model combo is skipped | `provider-run-state-failure-skip.test.ts` | fixed; focused test added | Hash collision risk is negligible |
| P1-08 | Repeated timeouts did not skip broken candidates | provider run-state files | Timeout failure count now skips provider/model after threshold | `provider-run-state-failure-skip.test.ts` | fixed; focused test added | Slow but valid providers may recover after cooldown only |
| P1-09 | Failure-count skip only applied to fast research | `provider-run-state.ts` | Failure skip now applies to deep/phd/full too | `provider-run-state-failure-skip.test.ts` | fixed; focused test added | Threshold tuning may need production telemetry |
| P1-10 | Gemini 1.5 Pro fallback was deprecated | Gemini/provider files | Replaced Gemini fallback/default with Gemini 2.5 options | `openrouter-stale-model-regression.test.ts` | fixed; focused test passed | Requires configured Gemini key for live use |
| P1-11 | Model defaults spread across files | provider/generation files | Defaults now route through shared provider/candidate policy and stale filters | provider/generation tests | fixed; focused tests added | Some legacy catalogs remain display-only |
| P1-12 | Missing providerRouter caused null fallback | `core-answer-generator.ts` | Throws typed config provider error when model generation lacks router | `openrouter-stale-model-regression.test.ts` | fixed; focused test passed | Caller must surface config error honestly |
| P1-13 | Provider health mixed chat/list/catalog states | provider health/status files | Added distinct health/list/live/fallback/failure fields | provider status tests | fixed; focused tests added | UI consumers must use the correct field |
| P2-01 | No freshness router existed | `freshness-router.ts` | Added deterministic freshness/current-affairs detector | `current-freshness-routing.test.ts` | fixed; focused test added | New political phrases may require extension |
| P2-02 | Current/latest/legal/conflict terms missed | freshness/agenda files | Added broad trigger coverage for current office, war, elections, judgments, bills, protests | `current-freshness-routing.test.ts` | fixed; focused test added | Ambiguous queries can still be static by design |
| P2-03 | Normal mode could answer current facts from memory | `anthropic-service.ts` | Freshness-sensitive normal prompts auto-route to evidence path | `current-freshness-routing.test.ts` | fixed; focused test added | Live search key required for real citations |
| P2-04 | Rhetorics mode could use stale current facts | `anthropic-service.ts` | Rhetorics freshness prompts use live/evidence context path | `current-freshness-routing.test.ts` | fixed; focused test added | Speech style still depends on generation provider |
| P2-05 | Drafting mode lacked current factual search | research mode/service files | Drafting added to freshness-sensitive routing schema | `current-freshness-routing.test.ts` | fixed; focused test added | Drafting UI must pass mode exactly |
| P2-06 | Current-event query without year did not prefer current sources | agenda/query planner files | `inferTemporalScope` biases current-event queries to current year | `current-freshness-routing.test.ts` | fixed; focused test added | Current date is runtime-dependent |
| P2-07 | Keyword extraction removed important years | agenda/query planner files | Year/entity preservation retained through keyword planning | `topic-specific-buckets.test.ts` | fixed; focused test added | Very noisy prompts can still need query pruning |
| P3-01 | Research modes bypassed evidence pipeline | service/pipeline files | Web/fast/deep/phd/full use `runResearchPipeline` primary path | `research-mode-routing.test.ts` | fixed; focused test passed | Live keys required for external retrieval |
| P3-02 | Legacy multi-search was primary/silent | service/pipeline files | Legacy path is explicit fallback/degraded only | `research-mode-routing.test.ts` | fixed; focused test passed | Some old callers may still call legacy directly |
| P3-03 | Deep mode hardcoded over effective mode | pipeline/service files | Pipeline receives real effective research mode | `research-mode-routing.test.ts` | fixed; focused test passed | Requires future callers not to hardcode mode |
| P3-04 | Live retrieval default missed fast/web modes | `research-pipeline.ts` | Default live retrieval includes all research modes | `research-mode-routing.test.ts` | fixed; focused test passed | No-key local runs use deterministic mock when allowed |
| P3-05 | Direct fast pipeline could produce empty sources | `research-pipeline.ts` | Mock/live retrieval fallback ensures direct fast has evidence in tests | `research-mode-routing.test.ts` | fixed; focused test passed | Live provider no-result remains source-gap/fallback |
| P3-06 | Multiple/missing terminal SSE events | pipeline event files | Added exactly-once terminal event emission | `research-terminal-events.test.ts` | fixed; focused test passed | Client must still ignore stale run IDs |
| P4-01 | Constitutional law used generic buckets | `source-buckets.ts` | Added constitutional/federalism/legal/parliamentary bucket plan | `topic-specific-buckets.test.ts` | fixed; focused test passed | Topic classifier may need tuning for edge cases |
| P4-02 | Security policy lacked legal/human-rights coverage | `source-buckets.ts` | Added security/legal/watchdog/media/research buckets | `topic-specific-buckets.test.ts` | fixed; focused test passed | Sensitive topics depend on source availability |
| P4-03 | GST/federalism missed economy/federal buckets | source bucket/query files | Added economic/federalism combined bucket coverage | `topic-specific-buckets.test.ts` | fixed; focused test passed | Complex fiscal prompts may need extra stats domains |
| P4-04 | Foreign/social/electoral/generic plans too generic | `source-buckets.ts` | Added topic-specific plans for foreign/social/electoral/generic parliament | `topic-specific-buckets.test.ts` | fixed; focused test passed | Generic prompts still need sane fallback buckets |
| P4-05 | Query templates used static generic strings | `source-buckets.ts`, `query-planner.ts` | Templates use `{agenda}` placeholder | `topic-specific-buckets.test.ts` | fixed; focused test passed | Poor agenda text can still yield broad queries |
| P4-06 | Malformed keyword-appended queries and duplicate years | query planner files | Deduped terms and preserved years/entities | `topic-specific-buckets.test.ts` | fixed; focused test passed | Very long prompts can still be truncated by provider |
| P4-07 | Fresh queries lacked current-year variants | query planner/agenda files | Added current-year variants when freshness is detected | `current-freshness-routing.test.ts` | fixed; focused test added | Current-year bias can miss older authoritative background |
| P4-08 | Tavily/Exa got unsupported `site:` top-ups | `search-executor.ts` | Provider-aware query transformation removes `site:` for Tavily/Exa | `topic-specific-buckets.test.ts` | fixed; focused test passed | Provider syntax support may evolve |
| P4-09 | Same important query did not fan out/merge providers | search executor/router files | Cross-provider execution merges/dedupes and preserves `discoveredBy` | search executor tests | fixed; focused tests added | External provider quotas may limit fanout |
| P5-01 | Canonicalization stripped meaningful legal params | `source-deduper.ts` | Tracking-only stripping preserves research-domain params | retrieval tests | fixed; focused tests added | New domains may need allowlist additions |
| P5-02 | Content dedupe ignored title/full text | `source-deduper.ts` | Dedupe uses title, larger snippet, and fullText excerpt | retrieval tests | fixed; focused tests added | Near-duplicate thresholds are heuristic |
| P5-03 | Near-duplicate pass risked O(n^2) blowups | `source-deduper.ts` | Added fast normalized-title index before heavier comparison | retrieval tests | fixed; focused tests added | Huge result sets still bounded by query caps |
| P5-04 | Unknown snippet-only sources scored too high | `source-scoring.ts` | Lowered unknown authority and strengthened snippet-only penalty | evidence/retrieval tests | fixed; focused tests added | Domain scoring needs ongoing curation |
| P5-05 | Official/court sources not prioritized enough | scoring/evidence files | Boosted official/court/government evidence for relevant Indian topics | evidence compressor tests | fixed; focused test passed | Ranking can still vary with source quality |
| P5-06 | Fresh current-event sources underweighted | `source-scoring.ts` | Added freshness boost for current-event sources | retrieval tests | fixed; focused tests added | Requires accurate publication dates when available |
| P5-07 | Retrieval ran too many queries after enough evidence | `bucketed-retrieval.ts` | Wired early stopping on source count and bucket coverage | retrieval tests | fixed; focused tests added | Early stop thresholds may need telemetry tuning |
| P5-08 | Reranker recomputed scores in comparator | `reranker.ts` | Precomputed scores once per source | reranker/retrieval tests | fixed; focused tests added | None beyond scoring heuristic quality |
| P6-01 | Readability fallback was regex-only | `source-enrichment.ts` | Added Readability + linkedom extraction before regex | `enrichment-budget-abort.test.ts` | fixed; focused test added | Some pages still extract poorly |
| P6-02 | Fallback readable text could be huge/noisy | `source-enrichment.ts` | Strips boilerplate and caps fallback text at 8,000 chars | `enrichment-budget-abort.test.ts` | fixed; focused test added | Site-specific boilerplate varies |
| P6-03 | Long noisy text was marked high quality | `source-enrichment.ts` | Quality uses density/article-confidence signals | `full-text-required.test.ts` | fixed; focused test passed | Density heuristic may need site tuning |
| P6-04 | Firecrawl requested unused HTML | Firecrawl provider | Request body now asks for markdown only | extraction tests | fixed; focused tests added | Firecrawl API changes may need update |
| P6-05 | Enrichment budget did not abort in-flight work | bucketed retrieval/source enrichment | Added mode-aware AbortController budget propagation | `enrichment-budget-abort.test.ts` | fixed; focused test added | Network stacks may not abort instantly |
| P6-06 | Outer AbortSignal was not passed to extraction | source enrichment/bucketed retrieval | Fetch/extraction receive the outer signal | `enrichment-budget-abort.test.ts` | fixed; focused test added | Custom fetchFn can ignore signal |
| P6-07 | Fast research retrieval could run too long | bucketed retrieval | Fast mode gets smaller enrichment budget/timeouts | `enrichment-budget-abort.test.ts` | fixed; focused test added | Very slow DNS/provider latency can still hit outer timeout |
| P6-08 | fullTextRequired buckets accepted snippet-only strong evidence | bucketed retrieval/evidence registry | Snippet-only/low extraction is weak and citation-ineligible for full text buckets | `full-text-required.test.ts` | fixed; focused test passed | Live source extraction failures produce honest gaps |
| P6-09 | Extraction accepted unsafe URLs | source URL policy/extractors | Blocks unsafe schemes, localhost, private IPs, metadata hosts before extraction | source enrichment security tests | fixed; focused tests added | DNS revalidation depends on runtime resolver |
| P7-01 | No deterministic evidence compression guarantee | `evidence-compressor.ts` | Deterministic source-card compressor added/enhanced | `evidence-compressor.test.ts` | fixed; focused test passed | Compression is heuristic, not semantic LLM compression |
| P7-02 | Evidence cards lost critical metadata | evidence compressor files | Cards preserve source ID, URL, bucket, providers, extraction, reliability, freshness, facts, numbers, holdings, limitations | `evidence-compressor.test.ts` | fixed; focused test passed | Missing upstream metadata cannot be invented |
| P7-03 | Mode budgets did not constrain evidence cards | evidence compressor/prompt budget files | Fast/deep/phd/full budgets enforce card count and size | `evidence-compressor.test.ts` | fixed; focused test passed | Extremely dense evidence may be dropped by priority |
| P7-04 | Prompt could dump raw huge extracted pages | core answer/prompt files | Prompt builder uses compressed cards when over budget | `prompt-budget-compression.test.ts` | fixed; focused test added | Very small provider contexts can still force source drops |
| P7-05 | Citation mapping risked source ID drift | evidence/prompt files | Compressed cards preserve exact original source IDs | evidence/generation tests | fixed; focused tests added | Final model can still omit required citations and then fail validation |
| P7-06 | Sources were dropped by truncation instead of diversity | evidence compressor files | Drop policy uses score and bucket diversity | `evidence-compressor.test.ts` | fixed; focused test passed | Diversity scoring is heuristic |
| P7-07 | Prompt metadata lacked compression/drop details | prompt/pipeline metadata files | Added original/included/dropped/compression/token metadata | `prompt-budget-compression.test.ts` | fixed; focused test added | Downstream UI display remains summary-based |
| P7-08 | Token estimator was optimistic | `prompt-budget.ts` | Safer chars/token estimate with multiplier/margins | `prompt-budget-compression.test.ts` | fixed; focused test added | Provider tokenizer differences remain approximate |
| P7-09 | Groq large-context model capped too low | `prompt-budget.ts` | Raised safe budget for Groq large context models | `prompt-budget-compression.test.ts` | fixed; focused test added | Real provider limits can change |
| P8-01 | Title-only facts were citation eligible | evidence registry/source usage | Title-only weak sources are citation-ineligible/failed | `evidence-eligibility.test.ts` | fixed; focused test added | Some valid primary pages with short text need extraction improvements |
| P8-02 | Snippet-only evidence satisfied full-text buckets | evidence/source contract/retrieval files | Snippet-only is distinguished from full-text citation and cannot satisfy fullTextRequired strong evidence | `full-text-required.test.ts` | fixed; focused test passed | If all full-text extraction fails, result becomes source gap |
| P8-03 | SourceUsageMap counted weak/title-only usage | `source-usage-map.ts` | Usage validation requires real support/extraction and eligible sources | `evidence-eligibility.test.ts` | fixed; focused test added | Model may still fail strict usage and trigger repair/failure |
| P8-04 | Deterministic role hardcoded minimum 30 | `model-role-runner.ts` | Minimum source requirement is computed by mode/evidence count | `evidence-eligibility.test.ts` | fixed; focused test added | Policy values may need product tuning |
| P8-05 | PhD near-threshold evidence could empty-fail | source contract/final status files | Near-threshold strong evidence returns source gaps instead of empty hard fail | `source-gap-completion.test.ts` | fixed; focused test passed | Zero/near-zero evidence still fails by design |
| P9-01 | Citation validator hardcoded 30 linked citations | `citation-validator.ts` | Thresholds are mode-aware and policy-derived | `citation-threshold-mode-aware.test.ts` | fixed; focused test added | Product may tighten thresholds later |
| P9-02 | Raw linked count rewarded citation spam | citation validator | Uses unique source coverage and keeps repeated spam checks | `citation-threshold-mode-aware.test.ts` | fixed; focused test added | Citation placement quality still depends on model output |
| P9-03 | Number hallucination used broad text includes | `hallucination-guard.ts` | Numbers validate against normalized structured keyNumbers/exact numeric support | `hallucination-number-support.test.ts` | fixed; focused test added | Complex derived calculations are not fully proven |
| P9-04 | Article claims passed just because registry had court text | hallucination/legal validation files | Article validation requires specific Article near legal/official evidence | `hallucination-number-support.test.ts` | fixed; focused test added | Ambiguous legal prose may need legal validator extension |
| P9-05 | Citation repair risked fake source IDs | repair/citation validation path | Repair remains constrained to original source IDs and source gap preservation | verification tests | fixed; focused tests added | Generation provider can still fail repair honestly |
| P10-01 | Source gaps were only prompt-dependent | core answer/final status files | Standard source limitation notice is injected post-generation | `source-gap-completion.test.ts` | fixed; focused test passed | Notice wording may need UI polish later |
| P10-02 | Legacy fallback and completion states blurred | pipeline/frontend status files | Added explicit degraded/fallback/source-gap semantics | `research-terminal-events.test.ts` and frontend status tests | fixed; focused tests added | Older persisted messages may have old metadata |
| P10-03 | Fast provider exhaustion could leave empty answer | pipeline/generation files | Retrieval success plus generation exhaustion returns degraded non-empty fallback with metadata | `source-gap-completion.test.ts` | fixed; focused test passed | If retrieval also fails, provider_error/failed remains possible |
| P10-04 | Deep/phd/full failures lacked terminal clarity | pipeline event/status files | Terminal provider/failure events emitted for strict modes | `research-terminal-events.test.ts` | fixed; focused test passed | Client must render terminal payload faithfully |
| P10-05 | HTTP 200 could hide failed final state | pipeline/final status/frontend files | SSE terminal payload carries explicit failed/provider/degraded state | pipeline/frontend tests | fixed; focused tests added | HTTP transport still returns 200 for SSE stream by design |
| P11-01 | Unsafe extraction URL schemes/hosts not blocked | source URL policy/extractors | Central policy rejects file/data/ftp/ws/javascript/local/private/link-local | source enrichment security tests | fixed; focused tests added | DNS edge cases rely on resolver behavior |
| P11-02 | Metadata hosts were extractable | source URL policy | Blocks `169.254.169.254` and metadata hostnames | source enrichment security tests | fixed; focused tests added | Cloud-provider aliases may need expansion |
| P11-03 | Chart colors could inject CSS/HTML | `chart.tsx` | Sanitized chart color config before `dangerouslySetInnerHTML` | `chart.test.tsx` | fixed; focused frontend test passed | Future style props need same sanitizer |
| P11-04 | Safe CSS variables needed to remain supported | `chart.tsx` | Allows safe CSS var tokens while rejecting dangerous payloads | `chart.test.tsx` | fixed; focused frontend test passed | CSS variable values themselves depend on trusted app CSS |
| P12-01 | Required backend regression tests were missing | backend test files | Added named tests across provider/retrieval/evidence/generation/pipeline/verification | focused backend tests | fixed; focused tests added | Full backend and frontend suites passed |
| P12-02 | Frontend display safety test was missing | frontend chart test | Added chart sanitizer regression test | `chart.test.tsx` | fixed; focused frontend test passed | Full frontend suite passed |
| P12-03 | Required bug matrix/report did not exist | this report | Created phase-by-phase report and matrix | documentation review | fixed; final verification passed | Manual live-key smoke remains blocked until keys/app are available |

## Manual Smoke Status

| smoke | expected behavior | status | blocker |
| --- | --- | --- | --- |
| Normal: `Raghav Chadha current party` | Freshness search/evidence context and cited answer | blocked | Requires live app plus provider/search API keys |
| Rhetorics: `Write a speech on current US-Iran war status` | Live current context, not stale model memory | blocked | Requires live app plus provider/search API keys |
| Fast: `Judiciary and institutional autonomy in India` | Search, compressed evidence, final answer | blocked | Requires live app plus provider/search API keys |
| Deep: `GST federalism and Centre-State financial relations` | Economic/federalism buckets | covered locally for bucket planning; live smoke blocked | Requires live app plus provider/search API keys for full run |
| PhD/full: `Article 356 and federalism in India` | Constitutional/federalism/legal buckets and source gaps if needed | covered locally for bucket/source-gap policy; live smoke blocked | Requires live app plus provider/search API keys for full run |
| Provider failure: forced OpenRouter invalid model | `invalid_model`, no retry, truthful fallback/provider terminal state | covered locally for routing/run-state; live smoke blocked | Requires OpenRouter key or live provider harness |

