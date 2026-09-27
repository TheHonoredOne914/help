import type { ChatMode } from "@/components/chat/chat-model-routing";
import type { PipelineMetadata } from "@/lib/pipeline-metadata";

export type ResearchModeProfileId =
  | "normal"
  | "fast_research"
  | "web_research"
  | "deep_research"
  | "council";

export type LivePanelId =
  | "council_chamber"
  | "deliberation_board"
  | "floor_strategy"
  | "chief_verdict"
  | "dimension_scores"
  | "division_progress"
  | "research_strategy"
  | "topic_strategy"
  | "guarded_pipeline";

export type PersistedBlockType =
  | "council_session"
  | "dimension_scores"
  | "divisions"
  | "research_plan"
  | "guarded_pipeline";

export type PipelinePurgeField =
  | "councilSession"
  | "dimensionScores"
  | "activeDivisions"
  | "completedDivisions"
  | "divisionProgress"
  | "divisionOutputs"
  | "customModelFound"
  | "researchPlan"
  | "sourceContract"
  | "coreQualityGate"
  | "selectedResearchMode"
  | "discussion"
  | "topicStrategy"
  | "archiveRouting"
  | "researchAngles";

export interface ResearchModeUiProfile {
  id: ResearchModeProfileId;
  livePanels: readonly LivePanelId[];
  persistedBlocks: readonly PersistedBlockType[];
  purgeOnRunStart: readonly PipelinePurgeField[];
}

const COUNCIL_PANELS = [
  "council_chamber",
  "deliberation_board",
  "floor_strategy",
  "chief_verdict",
] as const satisfies readonly LivePanelId[];

const DEEP_RESEARCH_PANELS = [
  "dimension_scores",
  "division_progress",
  "research_strategy",
  "topic_strategy",
  "guarded_pipeline",
] as const satisfies readonly LivePanelId[];

/** Every pipeline field that can leak across mode switches. */
export const ALL_PIPELINE_PURGE_FIELDS: readonly PipelinePurgeField[] = [
  "councilSession",
  "dimensionScores",
  "activeDivisions",
  "completedDivisions",
  "divisionProgress",
  "divisionOutputs",
  "customModelFound",
  "researchPlan",
  "sourceContract",
  "coreQualityGate",
  "selectedResearchMode",
  "discussion",
  "topicStrategy",
  "archiveRouting",
  "researchAngles",
];

/**
 * Fields each live panel reads from pipeline state.
 * Adding a panel here automatically updates purge lists for modes that exclude it.
 */
export const PANEL_OWNED_FIELDS: Record<LivePanelId, readonly PipelinePurgeField[]> = {
  council_chamber: ["councilSession"],
  deliberation_board: ["councilSession"],
  floor_strategy: ["councilSession"],
  chief_verdict: ["councilSession"],
  dimension_scores: ["dimensionScores", "completedDivisions"],
  division_progress: ["activeDivisions", "completedDivisions", "divisionProgress", "divisionOutputs"],
  research_strategy: ["researchPlan"],
  topic_strategy: ["topicStrategy"],
  guarded_pipeline: [
    "sourceContract",
    "coreQualityGate",
    "selectedResearchMode",
    "archiveRouting",
    "researchAngles",
  ],
};

/** Fields used by ResearchPipeline outside explicit panel gates. */
const RESEARCH_PIPELINE_BASE_FIELDS: readonly PipelinePurgeField[] = [
  "customModelFound",
  "discussion",
];

const COUNCIL_PANEL_SET = new Set<LivePanelId>(COUNCIL_PANELS);

function usesResearchPipeline(livePanels: readonly LivePanelId[]): boolean {
  return livePanels.some((panel) => !COUNCIL_PANEL_SET.has(panel));
}

export function deriveOwnedFields(livePanels: readonly LivePanelId[]): PipelinePurgeField[] {
  const owned = new Set<PipelinePurgeField>();
  for (const panel of livePanels) {
    for (const field of PANEL_OWNED_FIELDS[panel]) {
      owned.add(field);
    }
  }
  if (usesResearchPipeline(livePanels)) {
    for (const field of RESEARCH_PIPELINE_BASE_FIELDS) {
      owned.add(field);
    }
  }
  return [...owned];
}

export function derivePurgeOnRunStart(livePanels: readonly LivePanelId[]): PipelinePurgeField[] {
  const owned = new Set(deriveOwnedFields(livePanels));
  return ALL_PIPELINE_PURGE_FIELDS.filter((field) => !owned.has(field));
}

function buildProfile(
  id: ResearchModeProfileId,
  livePanels: readonly LivePanelId[],
  persistedBlocks: readonly PersistedBlockType[],
): ResearchModeUiProfile {
  return {
    id,
    livePanels,
    persistedBlocks,
    purgeOnRunStart: derivePurgeOnRunStart(livePanels),
  };
}

export const RESEARCH_MODE_PROFILES: Record<ResearchModeProfileId, ResearchModeUiProfile> = {
  normal: buildProfile("normal", [], []),
  fast_research: buildProfile("fast_research", ["guarded_pipeline"], ["guarded_pipeline"]),
  web_research: buildProfile("web_research", ["guarded_pipeline"], ["guarded_pipeline"]),
  deep_research: buildProfile(
    "deep_research",
    [...DEEP_RESEARCH_PANELS],
    ["dimension_scores", "divisions", "research_plan", "guarded_pipeline"],
  ),
  council: buildProfile("council", [...COUNCIL_PANELS], ["council_session"]),
};

export function resolveResearchModeProfileId(mode: ChatMode | "web_research"): ResearchModeProfileId {
  if (mode === "web_research") return "web_research";
  return mode;
}

export function getResearchModeProfile(mode: ChatMode | ResearchModeProfileId): ResearchModeUiProfile {
  const profileId = mode === "web_research" ? "web_research" : mode;
  return RESEARCH_MODE_PROFILES[profileId];
}

export function isPanelAllowed(profile: ResearchModeUiProfile, panelId: LivePanelId): boolean {
  return profile.livePanels.includes(panelId);
}

export function isPersistedBlockAllowed(
  profile: ResearchModeUiProfile,
  blockType: PersistedBlockType,
): boolean {
  return profile.persistedBlocks.includes(blockType);
}

export function resolveProfileIdFromPipelineMetadata(meta: PipelineMetadata): ResearchModeProfileId | null {
  const raw = meta.researchMode ?? meta.mode ?? meta.legacyDebug?.mode;
  if (!raw) return null;
  const normalized = String(raw).toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "web_research" || normalized === "web_search") return "web_research";
  if (normalized === "fast_research") return "fast_research";
  if (normalized === "deep_research") return "deep_research";
  if (normalized === "council") return "council";
  if (normalized === "normal") return "normal";
  return null;
}

/** Gate persisted transcript blocks by the mode that produced the message, not the active mode. */
export function shouldRenderPersistedPipeline(meta: PipelineMetadata): boolean {
  const profileId = resolveProfileIdFromPipelineMetadata(meta);
  if (!profileId) return true;
  return isPersistedBlockAllowed(getResearchModeProfile(profileId), "guarded_pipeline");
}

export function getPurgeFieldsOnModeSwitch(
  from: ResearchModeProfileId,
  to: ResearchModeProfileId,
): PipelinePurgeField[] {
  if (from === to) return [];
  const fields = new Set<PipelinePurgeField>(RESEARCH_MODE_PROFILES[to].purgeOnRunStart);
  const fromOwned = new Set(deriveOwnedFields(RESEARCH_MODE_PROFILES[from].livePanels));
  const toOwned = new Set(deriveOwnedFields(RESEARCH_MODE_PROFILES[to].livePanels));
  for (const field of fromOwned) {
    if (!toOwned.has(field)) {
      fields.add(field);
    }
  }
  return [...fields];
}
