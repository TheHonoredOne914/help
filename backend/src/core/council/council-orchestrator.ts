import type { AgendaContract } from "../agenda/agenda-contract.js";
import { RESEARCH_LIMITS } from "../config/research-mode.js";
import type { RawEvidenceSourceInput } from "../evidence/evidence-registry.js";
import type { ResearchRunIdentity } from "../pipeline/pipeline-events.js";
import type { CouncilModelAssignment, CouncilSession, CouncillorOutput, CouncillorPlan, RetrievingCouncillorId } from "./council-types.js";
import { COUNCIL_LIMITS } from "./council-config.js";
import { planCouncillors } from "./council-planner.js";
import { enrichForCouncillor } from "./councillor-enrich.js";
import { buildCouncillorRegistry, mergeEnrichedForRegistry } from "./councillor-registry.js";
import { buildCouncillorPacks, flattenCouncilEvidencePacks } from "./councillor-pack.js";
import { buildFailedCouncillorOutput, generateCouncillorBrief, type CouncilProviderRouter } from "./councillor-brief-generator.js";
import { findCouncilSeals } from "./deliberation-engine.js";
import { deterministicChiefFallback, synthesizeChiefVerdict } from "./chief-councillor-synthesis.js";
import { chiefVerdictChunk, chiefVerdictComplete, councilCChunk, councilCComplete, councilCStarted, deliberationUpdate } from "./council-stream-events.js";

export interface RunCouncilSessionInput {
  userQuery: string;
  identity: ResearchRunIdentity;
  providerRouter: CouncilProviderRouter;
  assignments: {
    default: CouncilModelAssignment;
    chief?: CouncilModelAssignment;
    councillors?: Partial<Record<RetrievingCouncillorId, CouncilModelAssignment>>;
  };
  agendaContract: AgendaContract;
  rawSources: RawEvidenceSourceInput[];
  signal: AbortSignal;
  sendEvent?: (event: Record<string, unknown>) => void;
  enrichmentKeys?: {
    jinaKey?: string;
    firecrawlKey?: string;
    scraperapiKey?: string;
    zenrowsKey?: string;
    scrapingbeeKey?: string;
    geekflareKey?: string;
  };
}

export async function runCouncilSession(input: RunCouncilSessionInput): Promise<CouncilSession> {
  const createdAt = new Date().toISOString();
  const plans = planCouncillors(input.userQuery, input.agendaContract);
  const councillors = emptyCouncillorRecord();
  const sessionBase: CouncilSession = {
    session_id: input.identity.runId,
    topic: input.agendaContract.normalizedAgenda,
    stance: "independent",
    status: "briefing",
    councillors,
    seals: [],
    disputes: [],
    agreement_score: 0,
    verdict: null,
    terminalStatus: "failed",
    created_at: createdAt,
  };

  if (input.rawSources.length < COUNCIL_LIMITS.minSourcesForSession) {
    const reason = new Error(`Council requires at least ${COUNCIL_LIMITS.minSourcesForSession} raw sources before briefing; received ${input.rawSources.length}.`);
    for (const plan of plans) {
      const failed = buildFailedCouncillorOutput(plan, reason);
      councillors[failed.councillor_id] = failed;
    }
    return {
      ...sessionBase,
      status: "complete",
      terminalStatus: "degraded_fallback",
      completed_at: new Date().toISOString(),
    };
  }

  // Consistency fix: each councillor gets up to 2 attempts. An attempt is
  // considered a failure if it throws OR if it returns fewer than
  // COUNCIL_LIMITS.minClaimsPerCouncillor evidence-grounded claims. This
  // turns silent "complete-but-empty" briefs into honest retries.
  const settled = await Promise.allSettled(plans.map((plan) => runCouncillorWithRetry(plan, input)));
  const outputs = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return buildFailedCouncillorOutput(plans[index], result.reason);
  });
  for (const output of outputs) {
    councillors[output.councillor_id] = output;
    input.sendEvent?.(councilCComplete(input.identity, output));
  }

  const deliberation = findCouncilSeals(outputs);
  input.sendEvent?.(deliberationUpdate(input.identity, deliberation.seals, deliberation.disputes, deliberation.agreementScore));

  const withDeliberation: CouncilSession = {
    ...sessionBase,
    status: "synthesizing",
    councillors,
    seals: deliberation.seals,
    disputes: deliberation.disputes,
    agreement_score: deliberation.agreementScore,
  };

  let verdict = null;
  let chiefSucceeded = false;
  if (input.signal.aborted) {
    verdict = deterministicChiefFallback(withDeliberation);
  } else try {
    verdict = await synthesizeChiefVerdict({
      session: withDeliberation,
      providerRouter: input.providerRouter,
      assignment: input.assignments.chief ?? input.assignments.default,
      signal: input.signal,
      onChunk: (chunk) => input.sendEvent?.(chiefVerdictChunk(input.identity, chunk)),
    });
    chiefSucceeded = true;
  } catch {
    verdict = deterministicChiefFallback(withDeliberation);
    chiefSucceeded = false;
  }
  input.sendEvent?.(chiefVerdictComplete(input.identity, verdict));

  const successfulCount = outputs.filter((output) => output.status === "complete" && output.key_claims.length >= COUNCIL_LIMITS.minClaimsPerCouncillor).length;
  const terminalStatus = input.signal.aborted
    ? "cancelled"
    : successfulCount === 0
      ? "degraded_fallback"
      : !chiefSucceeded || successfulCount < COUNCIL_LIMITS.minCompletedCouncillors || deliberation.seals.length === 0
        ? "completed_with_source_gaps"
        : "completed";

  return {
    ...withDeliberation,
    status: terminalStatus === "cancelled" ? "error" : "complete",
    verdict,
    terminalStatus,
    completed_at: new Date().toISOString(),
  };
}

async function runCouncillorWithRetry(plan: CouncillorPlan, input: RunCouncilSessionInput): Promise<CouncillorOutput> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (input.signal.aborted) throw new Error("Council request aborted");
    try {
      const output = await runSingleCouncillor(plan, input, attempt);
      if (output.status === "complete" && output.key_claims.length >= COUNCIL_LIMITS.minClaimsPerCouncillor) {
        return output;
      }
      // Treat under-minimum claim counts as a retryable soft-failure on the first pass.
      lastError = new Error(`Councillor ${plan.councillor_id} returned ${output.key_claims.length} valid claims (min ${COUNCIL_LIMITS.minClaimsPerCouncillor}).`);
      if (attempt === 1) return buildFailedCouncillorOutput(plan, lastError);
    } catch (error) {
      lastError = error;
      if (input.signal.aborted) throw error;
    }
  }
  return buildFailedCouncillorOutput(plan, lastError);
}

async function runSingleCouncillor(plan: CouncillorPlan, input: RunCouncilSessionInput, attempt: number): Promise<CouncillorOutput> {
  input.sendEvent?.(councilCStarted(input.identity, plan.councillor_id, plan.title));
  if (input.signal.aborted) throw new Error("Council request aborted");
  const rawSources = selectSourcesForPlan(input.rawSources, plan);
  const enriched = await enrichForCouncillor({
    brief: plan,
    rawSources,
    councillorId: plan.councillor_id,
    signal: input.signal,
    options: {
      jinaKey: input.enrichmentKeys?.jinaKey,
      firecrawlKey: input.enrichmentKeys?.firecrawlKey,
      scraperapiKey: input.enrichmentKeys?.scraperapiKey,
      zenrowsKey: input.enrichmentKeys?.zenrowsKey,
      scrapingbeeKey: input.enrichmentKeys?.scrapingbeeKey,
      geekflareKey: input.enrichmentKeys?.geekflareKey,
      useCache: true,
      timeoutMs: 8_000,
      concurrency: RESEARCH_LIMITS.council.enrichmentConcurrency,
    },
  });
  const registrySources = mergeEnrichedForRegistry(rawSources, enriched);
  const registry = buildCouncillorRegistry(input.agendaContract, registrySources, plan.councillor_id);
  const packs = buildCouncillorPacks(registry, input.agendaContract, plan.councillor_id, { maxCardsPerPack: COUNCIL_LIMITS.maxCardsPerPack });
  const pack = flattenCouncilEvidencePacks(packs);
  const assignment = input.assignments.councillors?.[plan.councillor_id] ?? input.assignments.default;
  return generateCouncillorBrief({
    brief: plan,
    pack,
    contract: input.agendaContract,
    providerRouter: input.providerRouter,
    assignment,
    signal: input.signal,
    onChunk: (chunk) => input.sendEvent?.(councilCChunk(input.identity, plan.councillor_id, chunk)),
    // On retry, nudge temperature up slightly and require explicit grounding to
    // break out of the previous failure mode (empty claims or malformed JSON).
    retryHint: attempt > 0
      ? "Previous attempt produced too few evidence-grounded claims. Cite at least three source IDs from the evidence pack and return between 3 and 6 key_claims."
      : undefined,
  });
}

function selectSourcesForPlan(sources: RawEvidenceSourceInput[], plan: CouncillorPlan): RawEvidenceSourceInput[] {
  const focused = sources.filter((source) => {
    const buckets = source.bucketIds ?? [];
    return buckets.length === 0 || buckets.some((bucketId) => plan.retrieval_focus.includes(bucketId));
  });
  const selected: RawEvidenceSourceInput[] = [];
  const seen = new Set<string>();
  const add = (source: RawEvidenceSourceInput) => {
    if (selected.length >= COUNCIL_LIMITS.maxRawSourcesPerCouncillor) return;
    const key = source.canonicalUrl ?? source.url ?? `${source.title ?? ""}:${source.excerpt ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(source);
  };
  for (const source of focused) add(source);
  if (selected.length < COUNCIL_LIMITS.maxRawSourcesPerCouncillor) {
    for (const source of sources) add(source);
  }
  return selected;
}

function emptyCouncillorRecord(): Record<RetrievingCouncillorId, CouncillorOutput | null> {
  return {
    C1_LEGAL: null,
    C2_ECONOMIC: null,
    C3_STRATEGIC: null,
    C4_SOCIAL: null,
    C5_HISTORICAL: null,
    C6_OPPOSITION: null,
  };
}
