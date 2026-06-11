export type QueryRelationType = "core_related" | "subtopic_related" | "temporary_side_query" | "unrelated";
export type SuggestedContextAction = "attach_to_workspace" | "create_subthread" | "temporary_isolated_response" | "new_workspace";

export interface WorkspaceContext {
  title?: string;
  summary?: string;
  anglePatterns?: string[];
}

export interface QueryRoutingResult {
  relationType: QueryRelationType;
  confidence: number;
  suggestedAction: SuggestedContextAction;
  overlapReasons: string[];
  driftRisks: string[];
  shouldAskUser: boolean;
}

const CORE_DEMOCRACY_TERMS = [
  "democratic space",
  "democracy",
  "press freedom",
  "civil liberties",
  "uapa",
  "fcra",
  "electoral integrity",
  "evm",
  "vvpat",
  "supreme court",
  "civic space",
  "human rights",
  "internet shutdown",
];

const INDIAN_LEGAL_SUBTOPIC_TERMS = [
  "marital rape",
  "article",
  "fundamental rights",
  "constitutional",
  "criminal law",
  "privacy",
  "sedition",
  "bail",
];

export function routeQueryAgainstWorkspace(query: string, workspaceContext?: WorkspaceContext | null): QueryRoutingResult {
  const q = query.toLowerCase();
  const context = `${workspaceContext?.title ?? ""} ${workspaceContext?.summary ?? ""} ${(workspaceContext?.anglePatterns ?? []).join(" ")}`.toLowerCase();
  if (!context.trim()) return isolated("No active archive context.");

  const legalHits = INDIAN_LEGAL_SUBTOPIC_TERMS.filter((term) => q.includes(term));
  if (legalHits.length > 0 && /india|constitutional|rights|supreme court|civil liberties|democratic/.test(context)) {
    return {
      relationType: "subtopic_related",
      confidence: 0.58,
      suggestedAction: "create_subthread",
      overlapReasons: legalHits,
      driftRisks: ["Could pull the archive away from the current democratic-space agenda."],
      shouldAskUser: true,
    };
  }

  const overlap = CORE_DEMOCRACY_TERMS.filter((term) => q.includes(term) && context.includes(term));
  const queryCoreHits = CORE_DEMOCRACY_TERMS.filter((term) => q.includes(term));
  if (overlap.length >= 1 || (queryCoreHits.length >= 2 && /democratic space|democracy|civil liberties|press freedom/.test(context))) {
    return {
      relationType: "core_related",
      confidence: Math.min(0.95, 0.72 + overlap.length * 0.06 + queryCoreHits.length * 0.03),
      suggestedAction: "attach_to_workspace",
      overlapReasons: overlap.length ? overlap : queryCoreHits,
      driftRisks: [],
      shouldAskUser: false,
    };
  }

  if (/phone|gaming|laptop|movie|recipe|travel|shopping/.test(q)) return isolated("Consumer or unrelated personal query.");

  return {
    relationType: "temporary_side_query",
    confidence: 0.42,
    suggestedAction: "temporary_isolated_response",
    overlapReasons: [],
    driftRisks: ["Low archive overlap; do not inject archive facts."],
    shouldAskUser: true,
  };
}

function isolated(reason: string): QueryRoutingResult {
  return {
    relationType: "unrelated",
    confidence: 0.9,
    suggestedAction: "temporary_isolated_response",
    overlapReasons: [],
    driftRisks: [reason],
    shouldAskUser: false,
  };
}
