import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidencePack } from "../evidence/evidence-pack/types.js";
import type { ProviderJsonResponse, ProviderName, ProviderRequest } from "../providers/provider-types.js";
import { COUNCIL_LIMITS } from "./council-config.js";
import type { ClaimObject, CouncilModelAssignment, CouncillorOutput, CouncillorPlan } from "./council-types.js";

export interface CouncilProviderRouter {
  completeJson(providerName: ProviderName, request: ProviderRequest): Promise<ProviderJsonResponse>;
}

export interface GenerateCouncillorBriefInput {
  brief: CouncillorPlan;
  pack: EvidencePack;
  contract: AgendaContract;
  providerRouter: CouncilProviderRouter;
  assignment: CouncilModelAssignment;
  signal: AbortSignal;
  onChunk?: (chunk: string) => void;
  retryHint?: string;
}

interface CouncillorJson {
  summary?: string;
  raw_brief?: string;
  key_claims?: Array<Partial<ClaimObject>>;
}

export async function generateCouncillorBrief(input: GenerateCouncillorBriefInput): Promise<CouncillorOutput> {
  const startedAt = new Date().toISOString();
  const evidencePrompt = renderEvidencePack(input.pack, input.brief.councillor_id);
  const baseRequest = {
    model: input.assignment.model,
    roleName: `council_${input.brief.councillor_id.toLowerCase()}`,
    temperature: input.retryHint ? 0.35 : 0.2,
    maxTokens: 1800,
    timeoutMs: COUNCIL_LIMITS.briefTimeoutMs,
    retries: 0,
    signal: input.signal,
    metadata: {
      jsonSchema: councillorBriefSchema(),
      councilRole: input.brief.councillor_id,
    },
    messages: [
      {
        role: "system" as const,
        content: [
          "You are a BestDel Council specialist for Indian mock parliament research.",
          "Return strict JSON only. Do not invent citations. Use only source IDs visible in the evidence pack.",
          "Every key_claim must be evidence-grounded and framed for Treasury Bench, Opposition, POIs, rebuttals, motions, or committee recommendations.",
        ].join(" "),
      },
      {
        role: "user" as const,
        content: [
          `Agenda: ${input.contract.normalizedAgenda}`,
          `Councillor: ${input.brief.title}`,
          `Perspective: ${input.brief.perspective}`,
          "Evidence pack:",
          evidencePrompt || "No live sources were retrieved for this councillor. Return a cautious brief and empty key_claims.",
          "Return JSON: { summary, raw_brief, key_claims: [{ claim_id, text, source_ids, confidence, stance, tags }] }.",
          input.retryHint ? `Retry guidance: ${input.retryHint}` : "",
        ].filter(Boolean).join("\n\n"),
      },
    ],
  } satisfies ProviderRequest;

  const parsed = await completeCouncillorJson(input.providerRouter, input.assignment.providerName, baseRequest);
  const sourceIdSet = new Set(input.pack.cards.map((card) => `${input.brief.councillor_id}-S${card.sourceId}`));
  const claims = normalizeClaims(parsed.key_claims ?? [], input.brief.councillor_id, sourceIdSet);
  const rawBrief = textOrFallback(parsed.raw_brief, parsed.summary, input.brief.title);
  input.onChunk?.(rawBrief);
  return {
    councillor_id: input.brief.councillor_id,
    title: input.brief.title,
    perspective: input.brief.perspective,
    status: "complete",
    summary: textOrFallback(parsed.summary, rawBrief, input.brief.title),
    raw_brief: rawBrief,
    key_claims: claims,
    evidence_pack_ids: [input.pack.id],
    sources_used: [...new Set(claims.flatMap((claim) => claim.source_ids))],
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}

export function buildFailedCouncillorOutput(brief: CouncillorPlan, reason: unknown): CouncillorOutput {
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    councillor_id: brief.councillor_id,
    title: brief.title,
    perspective: brief.perspective,
    status: "failed",
    summary: `Councillor failed: ${message}`,
    raw_brief: "",
    key_claims: [],
    evidence_pack_ids: [],
    sources_used: [],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    error: message,
  };
}

async function completeCouncillorJson(router: CouncilProviderRouter, providerName: ProviderName, request: ProviderRequest): Promise<CouncillorJson> {
  try {
    const first = await router.completeJson(providerName, request);
    return parseCouncillorJson(first.json);
  } catch {
    const retry = await router.completeJson(providerName, {
      ...request,
      retries: 0,
      messages: [
        ...request.messages,
        {
          role: "user",
          content: "Previous response was malformed. Return strict JSON with summary, raw_brief, and key_claims array only.",
        },
      ],
    });
    return parseCouncillorJson(retry.json);
  }
}

function parseCouncillorJson(value: unknown): CouncillorJson {
  if (!value || typeof value !== "object") return { key_claims: [] };
  const record = value as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : undefined,
    raw_brief: typeof record.raw_brief === "string" ? record.raw_brief : undefined,
    key_claims: Array.isArray(record.key_claims) ? record.key_claims.map((item) => item as Partial<ClaimObject>) : [],
  };
}

function normalizeClaims(claims: Array<Partial<ClaimObject>>, councillorId: ClaimObject["councillor_id"], allowedSourceIds: Set<string>): ClaimObject[] {
  return claims
    .map((claim, index): ClaimObject | null => {
      const text = typeof claim.text === "string" ? claim.text.replace(/\s+/g, " ").trim() : "";
      if (text.length < 20) return null;
      const sourceIds = (Array.isArray(claim.source_ids) ? claim.source_ids : [])
        .filter((sourceId): sourceId is string => typeof sourceId === "string" && allowedSourceIds.has(sourceId));
      if (sourceIds.length === 0) return null;
      return {
        claim_id: typeof claim.claim_id === "string" && claim.claim_id.trim() ? claim.claim_id : `${councillorId}-CL${index + 1}`,
        text,
        source_ids: [...new Set(sourceIds)].slice(0, 4),
        councillor_id: councillorId,
        confidence: claim.confidence === "high" || claim.confidence === "medium" || claim.confidence === "low" ? claim.confidence : "medium",
        stance: claim.stance === "supports" || claim.stance === "challenges" || claim.stance === "neutral" ? claim.stance : "neutral",
        tags: (Array.isArray(claim.tags) ? claim.tags : []).filter((tag): tag is string => typeof tag === "string").slice(0, 5),
      };
    })
    .filter((claim): claim is ClaimObject => Boolean(claim))
    .slice(0, COUNCIL_LIMITS.maxClaimsPerCouncillor);
}

function renderEvidencePack(pack: EvidencePack, councillorId: string): string {
  return pack.cards.map((card) => [
    `[${councillorId}-S${card.sourceId}] ${card.title}`,
    `URL: ${card.url}`,
    `Buckets: ${card.bucketIds.join(", ")}`,
    `Facts: ${card.keyFacts.slice(0, 3).join("; ") || card.contentPreview || card.topChunks[0]?.text || "No facts extracted."}`,
    `Limitations: ${card.limitations.slice(0, 2).join("; ") || "none"}`,
  ].join("\n")).join("\n\n");
}

function textOrFallback(primary: string | undefined, fallback: string | undefined, title: string): string {
  const value = primary?.trim() || fallback?.trim();
  return value || `${title} found no sufficiently grounded claims in the available evidence.`;
}

function councillorBriefSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "raw_brief", "key_claims"],
    properties: {
      summary: { type: "string" },
      raw_brief: { type: "string" },
      key_claims: {
        type: "array",
        items: {
          type: "object",
          required: ["claim_id", "text", "source_ids", "confidence", "stance", "tags"],
          properties: {
            claim_id: { type: "string" },
            text: { type: "string" },
            source_ids: { type: "array", items: { type: "string" } },
            confidence: { enum: ["high", "medium", "low"] },
            stance: { enum: ["supports", "challenges", "neutral"] },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}
