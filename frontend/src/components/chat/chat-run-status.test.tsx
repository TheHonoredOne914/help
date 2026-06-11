import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ResearchRunSidebar,
  summarizeResearchRunSidebar,
} from "./chat-run-status";

test("research run sidebar has no static fake pipeline or evidence rows", () => {
  const summary = summarizeResearchRunSidebar({
    runStatus: "running",
    selectedResearchMode: "deep_research",
    corePipelineEvents: [],
    fullSourceManifest: null,
    citationStatus: null,
    sourceContract: null,
    sourceGapReport: null,
    activeArchiveName: "Archive",
    activeArchiveTopic: "Topic",
    activeArchiveAngles: [],
  });

  const html = renderToStaticMarkup(<ResearchRunSidebar summary={summary} />);

  assert.doesNotMatch(html, /28 documents|14 analyses|Digital Personal Data Protection Act|Climate Change Action Plan/);
  assert.match(html, /Sources will appear here after retrieval emits a live manifest/);
});

test("research run sidebar renders live source counts when metadata exists", () => {
  const summary = summarizeResearchRunSidebar({
    runStatus: "completed_with_source_gaps",
    selectedResearchMode: "fast_research",
    corePipelineEvents: [{ type: "retrieval_started", timestamp: 1 }],
    fullSourceManifest: {
      totalSources: 2,
      sources: [
        { index: 1, title: "PIB brief", url: "https://pib.gov.in/x", badge: "GOV", sourceType: "government_india", score: 1, hasFullContent: true, contentPreview: "" },
        { index: 2, title: "SC judgment", url: "https://sci.gov.in/y", badge: "COURT", sourceType: "court_judgement", score: 1, hasFullContent: true, contentPreview: "" },
      ],
    },
    citationStatus: {
      finalUniqueCitedSources: 1,
      totalLinkedCitations: 1,
      citedSourceIds: [1],
      citationCoverage: 0.5,
    },
    sourceContract: null,
    sourceGapReport: null,
    activeArchiveName: "Archive",
    activeArchiveTopic: "Topic",
    activeArchiveAngles: ["Angle"],
  });

  const html = renderToStaticMarkup(<ResearchRunSidebar summary={summary} />);

  assert.match(html, /2 sources/);
  assert.match(html, /1 cited/);
  assert.match(html, /PIB brief/);
  assert.match(html, /Completed With Source Gaps/);
});
