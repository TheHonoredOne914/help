import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildCoreAnswerSystemPrompt } from "../../src/core/generation/core-answer-prompt.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";
import type { CoreResearchAnswerInput } from "../../src/core/generation/core-answer-generator.js";

test("committee-aware system prompt includes Lok Sabha and AIPPM cues", () => {
  const lokSabhaInput = fakeCoreInput("Lok Sabha Question Hour debate on Article 21 internet shutdowns");
  const lokPrompt = buildCoreAnswerSystemPrompt(lokSabhaInput);
  assert.match(lokPrompt, /Question Hour/i);
  assert.match(lokPrompt, /Zero Hour/i);

  const aippm = fakeCoreInput("AIPPM debate on concurrent list and inter-state council finance");
  aippm.agendaContract = buildAgendaContract({ originalUserQuery: aippm.userQuery });
  const aippmPrompt = buildCoreAnswerSystemPrompt(aippm);
  assert.match(aippmPrompt, /concurrent list/i);
  assert.match(aippmPrompt, /inter-state council/i);
});

function fakeCoreInput(userQuery: string): CoreResearchAnswerInput {
  const run = createFakeResearchRun(12, "fast_research");
  return {
    requestId: `prompt-${Date.now()}`,
    userQuery,
    mode: "fast_research",
    agendaContract: buildAgendaContract({ originalUserQuery: userQuery }),
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [],
    generationMode: "deterministic",
  };
}
