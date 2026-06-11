import type { ProviderJsonResponse, ProviderName, ProviderRequest } from "../providers/provider-types.js";
import { COUNCIL_LIMITS } from "./council-config.js";
import type { CouncilModelAssignment, CouncilSession, CouncilVerdict } from "./council-types.js";
import type { CouncilProviderRouter } from "./councillor-brief-generator.js";

export interface ChiefSynthesisInput {
  session: CouncilSession;
  providerRouter: CouncilProviderRouter;
  assignment: CouncilModelAssignment;
  signal: AbortSignal;
  onChunk?: (chunk: string) => void;
}

export async function synthesizeChiefVerdict(input: ChiefSynthesisInput): Promise<CouncilVerdict> {
  const prompt = buildChiefPrompt(input.session);
  const response = await input.providerRouter.completeJson(input.assignment.providerName, {
    model: input.assignment.model,
    roleName: "council_c7_chief",
    temperature: 0.2,
    maxTokens: 2200,
    timeoutMs: COUNCIL_LIMITS.chiefTimeoutMs,
    retries: 1,
    signal: input.signal,
    metadata: { jsonSchema: councilVerdictSchema(), councilRole: "C7_CHIEF" },
    messages: [
      {
        role: "system",
        content: "You are C7, the BestDel Chief Councillor. You must not retrieve sources. Use only C1-C6 briefs, Council Seals, and disputes. Return strict JSON only.",
      },
      { role: "user", content: prompt },
    ],
  } satisfies ProviderRequest);
  const verdict = normalizeVerdict(response, input.session);
  input.onChunk?.(verdict.strategic_position);
  return verdict;
}

export function deterministicChiefFallback(session: CouncilSession): CouncilVerdict {
  const topSeal = session.seals[0];
  const dispute = session.disputes[0];
  const position = topSeal
    ? `The Council's strongest shared position is: ${topSeal.claim.text}`
    : "The Council did not reach a reliable seal; use a cautious, source-gap-aware floor strategy.";
  return {
    strategic_position: position,
    top_arguments: session.seals.slice(0, 3).map((seal) => ({ argument: seal.claim.text, strength: seal.support_count >= 4 ? "strong" : "moderate" })),
    top_vulnerabilities: dispute ? [{ vulnerability: dispute.summary, severity: "medium" }] : [{ vulnerability: "Council consensus was thin or unavailable.", severity: "high" }],
    recommended_speech_strategy: "Lead with verified common ground, mark uncertainty explicitly, and reserve contested points for rebuttal rather than opening claims.",
    opening_speech_variants: [
      { style: "measured", text: position },
      { style: "aggressive", text: topSeal ? `The Opposition must answer this sourced record: ${topSeal.claim.text}` : "This House should not overclaim without a stronger record." },
      { style: "rhetorical", text: "The question before this House is not volume of assertion, but whether evidence survives scrutiny." },
    ],
    poi_bank: session.disputes.slice(0, 5).map((item) => ({ poi: `How do you reconcile ${item.claim_a.claim_id} with ${item.claim_b.claim_id}?`, timing_cue: "Use during direct clash.", target_councillor: item.councillors.join(", ") })),
    clash_matrix: {
      government_args: session.seals.filter((seal) => seal.claim.stance !== "challenges").slice(0, 4).map((seal) => seal.claim.text),
      opposition_args: session.disputes.slice(0, 4).map((item) => item.claim_b.text),
      crossfire_points: session.disputes.slice(0, 4).map((item) => item.summary),
    },
  };
}

function buildChiefPrompt(session: CouncilSession): string {
  const councillors = Object.values(session.councillors)
    .filter((output): output is NonNullable<typeof output> => Boolean(output))
    .map((output) => [
      `${output.councillor_id} ${output.title} (${output.status})`,
      output.summary,
      ...output.key_claims.map((claim) => `- ${claim.claim_id}: ${claim.text} [${claim.source_ids.join(", ")}]`),
    ].join("\n"))
    .join("\n\n");
  const seals = session.seals.map((seal) => `- ${seal.seal_id}: ${seal.claim.text} (${seal.support_count} councillors)`).join("\n") || "No seals.";
  const disputes = session.disputes.map((dispute) => `- ${dispute.dispute_id}: ${dispute.summary}`).join("\n") || "No disputes.";
  return [
    `Agenda: ${session.topic}`,
    "Councillor briefs:",
    trimToBudget(councillors),
    "Council Seals:",
    seals,
    "Council Disputes:",
    disputes,
    "Return JSON matching the requested verdict schema with Indian parliamentary strategy, POIs, rebuttals, motions, and committee framing.",
  ].join("\n\n");
}

function normalizeVerdict(response: ProviderJsonResponse, session: CouncilSession): CouncilVerdict {
  const value = response.json;
  if (!value || typeof value !== "object") return deterministicChiefFallback(session);
  const record = value as Record<string, unknown>;
  const fallback = deterministicChiefFallback(session);
  return {
    strategic_position: stringValue(record.strategic_position, fallback.strategic_position),
    top_arguments: arrayOfObjects(record.top_arguments, fallback.top_arguments).map((item) => ({
      argument: stringValue(item.argument, ""),
      strength: item.strength === "strong" || item.strength === "moderate" ? item.strength : "moderate",
    })).filter((item) => item.argument),
    top_vulnerabilities: arrayOfObjects(record.top_vulnerabilities, fallback.top_vulnerabilities).map((item) => ({
      vulnerability: stringValue(item.vulnerability, ""),
      severity: item.severity === "high" || item.severity === "medium" ? item.severity : "medium",
    })).filter((item) => item.vulnerability),
    recommended_speech_strategy: stringValue(record.recommended_speech_strategy, fallback.recommended_speech_strategy),
    opening_speech_variants: arrayOfObjects(record.opening_speech_variants, fallback.opening_speech_variants).map((item) => ({
      style: item.style === "aggressive" || item.style === "measured" || item.style === "rhetorical" ? item.style : "measured",
      text: stringValue(item.text, ""),
    })).filter((item) => item.text),
    poi_bank: arrayOfObjects(record.poi_bank, fallback.poi_bank).map((item) => ({
      poi: stringValue(item.poi, ""),
      timing_cue: stringValue(item.timing_cue, "Use during clash."),
      target_councillor: typeof item.target_councillor === "string" ? item.target_councillor : undefined,
    })).filter((item) => item.poi),
    clash_matrix: normalizeClashMatrix(record.clash_matrix, fallback.clash_matrix),
  };
}

function trimToBudget(text: string): string {
  const maxChars = Math.floor(COUNCIL_LIMITS.chiefTokenBudget * 3.2);
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOfObjects<T extends Record<string, unknown>>(value: unknown, fallback: T[]): T[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is T => Boolean(item && typeof item === "object"));
  return items.length ? items : fallback;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : fallback;
}

function normalizeClashMatrix(value: unknown, fallback: CouncilVerdict["clash_matrix"]): CouncilVerdict["clash_matrix"] {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    government_args: stringArray(record.government_args, fallback.government_args),
    opposition_args: stringArray(record.opposition_args, fallback.opposition_args),
    crossfire_points: stringArray(record.crossfire_points, fallback.crossfire_points),
  };
}

function councilVerdictSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["strategic_position", "top_arguments", "top_vulnerabilities", "recommended_speech_strategy", "opening_speech_variants", "poi_bank", "clash_matrix"],
    properties: {
      strategic_position: { type: "string" },
      top_arguments: { type: "array" },
      top_vulnerabilities: { type: "array" },
      recommended_speech_strategy: { type: "string" },
      opening_speech_variants: { type: "array" },
      poi_bank: { type: "array" },
      clash_matrix: { type: "object" },
    },
  };
}
