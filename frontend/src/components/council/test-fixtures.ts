import type { ClaimObject, CouncilSession, CouncillorOutput, RetrievingCouncillorId } from "./council-types";

const titles = ["Legal Councillor", "Economic Councillor", "Strategic Councillor", "Social Councillor", "Historical Councillor", "Opposition Councillor"];

function makeClaim(id: RetrievingCouncillorId, index: number): ClaimObject {
  return {
    claim_id: `claim-${index}`,
    text: "Federalism claim",
    source_ids: [`${id}-S1`],
    councillor_id: id,
    confidence: "high",
    stance: index < 3 ? "supports" : "challenges",
    tags: ["federalism"],
  };
}

function makeOutput(id: RetrievingCouncillorId, index: number): CouncillorOutput {
  return {
    councillor_id: id,
    title: titles[index],
    perspective: "Committee-ready parliamentary analysis",
    status: "complete",
    summary: `${titles[index]} brief text.`,
    raw_brief: `${titles[index]} raw chamber brief.`,
    key_claims: [makeClaim(id, index)],
    sources_used: [`${id}-S1`],
    evidence_pack_ids: [],
    started_at: "2026-06-04T00:00:00.000Z",
    completed_at: "2026-06-04T00:01:00.000Z",
  };
}

export function makeCouncilSessionFixture(): CouncilSession {
  const councillors: CouncilSession["councillors"] = {
    C1_LEGAL: makeOutput("C1_LEGAL", 0),
    C2_ECONOMIC: makeOutput("C2_ECONOMIC", 1),
    C3_STRATEGIC: makeOutput("C3_STRATEGIC", 2),
    C4_SOCIAL: makeOutput("C4_SOCIAL", 3),
    C5_HISTORICAL: makeOutput("C5_HISTORICAL", 4),
    C6_OPPOSITION: makeOutput("C6_OPPOSITION", 5),
  };

  return {
    session_id: "session-fixture",
    topic: "GST federalism debate",
    stance: "independent",
    status: "complete",
    terminalStatus: "completed",
    councillors,
    seals: [{
      seal_id: "seal-1",
      claim: councillors.C1_LEGAL!.key_claims[0],
      level: "council_endorsed",
      endorsing_councillors: ["C1_LEGAL", "C2_ECONOMIC", "C3_STRATEGIC"],
      support_count: 3,
      supporting_claim_ids: ["claim-0", "claim-1", "claim-2"],
    }],
    disputes: [{
      dispute_id: "dispute-1",
      claim_a: councillors.C1_LEGAL!.key_claims[0],
      claim_b: councillors.C4_SOCIAL!.key_claims[0],
      conflict_type: "direct_contradiction",
      summary: "The chamber found a direct contradiction in the federalism framing.",
      councillors: ["C1_LEGAL", "C4_SOCIAL"],
    }],
    agreement_score: 72,
    chief_verdict_stream: "",
    verdict: {
      strategic_position: "Use a measured federalism position.",
      top_arguments: [{ argument: "Federal trust must be protected.", strength: "strong" }],
      top_vulnerabilities: [{ vulnerability: "Opposition can allege coercive federalism.", severity: "high" }],
      recommended_speech_strategy: "Open with constitutional accountability.",
      opening_speech_variants: [{ style: "measured", text: "Honourable Chair, federal trust matters." }],
      poi_bank: [{ poi: "Where is the constitutional bar?", timing_cue: "after federalism objection" }],
      clash_matrix: { government_args: ["accountability"], opposition_args: ["coercion"], crossfire_points: ["GST Council record"] },
    },
    created_at: "2026-06-04T00:00:00.000Z",
    completed_at: "2026-06-04T00:01:00.000Z",
  };
}
