import type { CouncillorRole, RetrievingCouncillorId } from "./council-types.js";

export const RETRIEVING_COUNCILLOR_IDS: readonly RetrievingCouncillorId[] = [
  "C1_LEGAL",
  "C2_ECONOMIC",
  "C3_STRATEGIC",
  "C4_SOCIAL",
  "C5_HISTORICAL",
  "C6_OPPOSITION",
];

export const COUNCILLOR_ROLES: readonly CouncillorRole[] = [
  {
    id: "C1_LEGAL",
    title: "Legal Councillor",
    shortTitle: "Legal",
    perspective: "constitutional validity, Supreme Court doctrine, statutory limits, and rights-based challenge",
    retrievalFocus: ["court_legal", "legal_commentary", "parliamentary_records", "government_official"],
    retrievesEvidence: true,
  },
  {
    id: "C2_ECONOMIC",
    title: "Economic Councillor",
    shortTitle: "Economic",
    perspective: "fiscal impact, implementation cost, welfare tradeoffs, and ministry accountability",
    retrievalFocus: ["government_official", "policy_research", "academic_research", "indian_major_media"],
    retrievesEvidence: true,
  },
  {
    id: "C3_STRATEGIC",
    title: "Strategic Councillor",
    shortTitle: "Strategic",
    perspective: "floor strategy, coalition pressure, policy sequencing, and debate utility",
    retrievalFocus: ["parliamentary_records", "indian_major_media", "policy_research", "government_official"],
    retrievesEvidence: true,
  },
  {
    id: "C4_SOCIAL",
    title: "Social Councillor",
    shortTitle: "Social",
    perspective: "rights impact, affected communities, civil liberties, public order, and social legitimacy",
    retrievalFocus: ["human_rights_watchdog", "civic_space", "digital_rights", "press_freedom", "indian_major_media"],
    retrievesEvidence: true,
  },
  {
    id: "C5_HISTORICAL",
    title: "Historical Councillor",
    shortTitle: "Historical",
    perspective: "precedent, committee history, federal practice, institutional memory, and prior implementation",
    retrievalFocus: ["parliamentary_records", "academic_research", "policy_research", "court_legal"],
    retrievesEvidence: true,
  },
  {
    id: "C6_OPPOSITION",
    title: "Opposition Councillor",
    shortTitle: "Opposition",
    perspective: "counter-case, vulnerabilities, rights challenge, federalism objection, and POI pressure",
    retrievalFocus: ["legal_commentary", "human_rights_watchdog", "indian_major_media", "court_legal", "policy_research"],
    retrievesEvidence: true,
  },
  {
    id: "C7_CHIEF",
    title: "Chief Councillor",
    shortTitle: "Chief",
    perspective: "synthesizes only the six councillor briefs, seals, and disputes into a strategic verdict",
    retrievalFocus: [],
    retrievesEvidence: false,
  },
];

export const COUNCIL_LIMITS = {
  minSourcesForSession: 90,
  minCompletedCouncillors: 5,
  maxRawSourcesPerCouncillor: 50,
  maxCardsPerPack: 16,
  maxCardsInCouncillorPrompt: 288,
  minClaimsPerCouncillor: 3,
  maxClaimsPerCouncillor: 6,
  briefTimeoutMs: 180_000,
  chiefTimeoutMs: 240_000,
  chiefTokenBudget: 60_000,
  enrichmentBudgetMs: 480_000,
  timeoutMs: Number.parseInt(process.env.COUNCIL_TIMEOUT_MS ?? "", 10) || 30 * 60 * 1000,
} as const;

export const COUNCIL_TIMEOUT_MS = COUNCIL_LIMITS.timeoutMs;

export function roleForCouncillor(id: RetrievingCouncillorId) {
  return COUNCILLOR_ROLES.find((role) => role.id === id && role.retrievesEvidence);
}
