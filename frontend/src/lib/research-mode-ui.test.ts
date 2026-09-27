import test from "node:test";
import assert from "node:assert/strict";
import type { PipelineMetadata } from "./pipeline-metadata";
import {
  ALL_PIPELINE_PURGE_FIELDS,
  PANEL_OWNED_FIELDS,
  RESEARCH_MODE_PROFILES,
  deriveOwnedFields,
  getPurgeFieldsOnModeSwitch,
  getResearchModeProfile,
  isPanelAllowed,
  isPersistedBlockAllowed,
  resolveProfileIdFromPipelineMetadata,
  shouldRenderPersistedPipeline,
} from "./research-mode-ui";
import type { LivePanelId, ResearchModeProfileId } from "./research-mode-ui";

test("fast_research profile excludes council and dimension panels", () => {
  const profile = getResearchModeProfile("fast_research");
  assert.equal(isPanelAllowed(profile, "council_chamber"), false);
  assert.equal(isPanelAllowed(profile, "deliberation_board"), false);
  assert.equal(isPanelAllowed(profile, "floor_strategy"), false);
  assert.equal(isPanelAllowed(profile, "chief_verdict"), false);
  assert.equal(isPanelAllowed(profile, "dimension_scores"), false);
  assert.equal(isPanelAllowed(profile, "division_progress"), false);
});

test("council profile includes council panels", () => {
  const profile = getResearchModeProfile("council");
  assert.equal(isPanelAllowed(profile, "council_chamber"), true);
  assert.equal(isPanelAllowed(profile, "deliberation_board"), true);
  assert.equal(isPanelAllowed(profile, "floor_strategy"), true);
  assert.equal(isPanelAllowed(profile, "chief_verdict"), true);
});

test("switching council to fast_research purges councilSession and dimensionScores", () => {
  const purgeFields = getPurgeFieldsOnModeSwitch("council", "fast_research");
  assert.ok(purgeFields.includes("councilSession"));
  assert.ok(purgeFields.includes("dimensionScores"));
});

test("every mode purges fields owned by panels it does not allow", () => {
  const allPanels = Object.keys(PANEL_OWNED_FIELDS) as LivePanelId[];

  for (const [modeId, profile] of Object.entries(RESEARCH_MODE_PROFILES) as Array<
    [ResearchModeProfileId, (typeof RESEARCH_MODE_PROFILES)[ResearchModeProfileId]]
  >) {
    const allowedPanels = new Set(profile.livePanels);
    const disallowedPanelFields = new Set(
      allPanels
        .filter((panel) => !allowedPanels.has(panel))
        .flatMap((panel) => PANEL_OWNED_FIELDS[panel]),
    );
    const purgeSet = new Set(profile.purgeOnRunStart);

    for (const field of disallowedPanelFields) {
      assert.ok(
        purgeSet.has(field),
        `${modeId} must purge ${field} (read by a panel outside livePanels)`,
      );
    }
  }
});

test("purgeOnRunStart is the complement of owned fields for each mode", () => {
  for (const profile of Object.values(RESEARCH_MODE_PROFILES)) {
    const owned = new Set(deriveOwnedFields(profile.livePanels));
    const purged = new Set(profile.purgeOnRunStart);
    for (const field of ALL_PIPELINE_PURGE_FIELDS) {
      assert.equal(
        purged.has(field),
        !owned.has(field),
        `${profile.id}: ${field} purge/owned mismatch`,
      );
    }
  }
});

test("fast_research and web_research purge deep and council fields", () => {
  for (const mode of ["fast_research", "web_research"] as const) {
    const purge = new Set(getResearchModeProfile(mode).purgeOnRunStart);
    assert.ok(purge.has("councilSession"));
    assert.ok(purge.has("dimensionScores"));
    assert.ok(purge.has("researchPlan"));
    assert.ok(purge.has("topicStrategy"));
    assert.ok(purge.has("sourceContract") === false);
    assert.ok(purge.has("coreQualityGate") === false);
  }
});

test("deep_research only purges councilSession among mode-specific fields", () => {
  const purge = new Set(getResearchModeProfile("deep_research").purgeOnRunStart);
  assert.ok(purge.has("councilSession"));
  assert.ok(!purge.has("dimensionScores"));
  assert.ok(!purge.has("researchPlan"));
  assert.ok(!purge.has("sourceContract"));
});

test("resolveProfileIdFromPipelineMetadata reads researchMode and legacy mode", () => {
  assert.equal(
    resolveProfileIdFromPipelineMetadata({ researchMode: "fast_research" }),
    "fast_research",
  );
  assert.equal(
    resolveProfileIdFromPipelineMetadata({ mode: "council" }),
    "council",
  );
  assert.equal(
    resolveProfileIdFromPipelineMetadata({ legacyDebug: { mode: "web_search" } }),
    "web_research",
  );
  assert.equal(resolveProfileIdFromPipelineMetadata({}), null);
});

test("shouldRenderPersistedPipeline gates by message mode, not active mode", () => {
  const fastMeta: PipelineMetadata = {
    researchMode: "fast_research",
    sourceContract: { status: "passed" },
  };
  const councilMeta: PipelineMetadata = {
    researchMode: "council",
    sourceContract: { status: "passed" },
  };
  const legacyMeta: PipelineMetadata = {
    sourceContract: { status: "passed" },
  };

  assert.equal(shouldRenderPersistedPipeline(fastMeta), true);
  assert.equal(shouldRenderPersistedPipeline(councilMeta), false);
  assert.equal(shouldRenderPersistedPipeline(legacyMeta), true);
});

test("council persistedBlocks exclude guarded_pipeline transcript block", () => {
  const profile = getResearchModeProfile("council");
  assert.equal(isPersistedBlockAllowed(profile, "council_session"), true);
  assert.equal(isPersistedBlockAllowed(profile, "guarded_pipeline"), false);
});
