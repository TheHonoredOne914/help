import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { COUNCIL_LIMITS } from "../../src/core/council/council-config.js";
import { runCouncilSession } from "../../src/core/council/council-orchestrator.js";
import { flattenCouncilEvidencePacks } from "../../src/core/council/councillor-pack.js";

test("council session degrades before briefing when raw source floor is impossible", async () => {
  const contract = buildAgendaContract({
    requestId: "council-raw-source-floor",
    originalUserQuery: "Council research on Indian constitutional accountability",
    outputDepth: "deep_research",
  });

  const session = await runCouncilSession({
    userQuery: contract.originalUserQuery,
    identity: {
      runId: "council-raw-source-floor",
      requestId: "council-raw-source-floor",
      providerName: "groq",
      model: "llama-3.3-70b-versatile",
      researchMode: "council",
    },
    providerRouter: {} as any,
    assignments: {
      default: { providerName: "groq", model: "llama-3.3-70b-versatile" },
    },
    agendaContract: contract,
    rawSources: [],
    signal: new AbortController().signal,
  });

  assert.equal(session.terminalStatus, "degraded_fallback");
  assert.equal(Object.values(session.councillors).filter((output) => output?.status === "failed").length, 6);
});

test("council evidence pack flattening uses prompt-card cap, not raw-source cap", () => {
  const cards = Array.from({ length: COUNCIL_LIMITS.maxCardsInCouncillorPrompt + 20 }, (_, index) => ({
    sourceId: index + 1,
  }));
  const pack = flattenCouncilEvidencePacks({
    a: { id: "a", cards, limitations: [] } as any,
  });

  assert.equal(pack.cards.length, COUNCIL_LIMITS.maxCardsInCouncillorPrompt);
  assert.ok(pack.cards.length > COUNCIL_LIMITS.maxRawSourcesPerCouncillor);
});
