import test from "node:test";
import assert from "node:assert/strict";
import { generateCoreResearchAnswer } from "../../src/core/generation/core-answer-generator.js";
import { buildSourceUsageMapFromRegistry } from "../../src/core/evidence/source-usage-map.js";
import { FakeProviderRouter } from "../harness/fake-provider-router.js";
import { createFakeResearchRun } from "../harness/fake-evidence-registry.js";

function passingAnswer(run: ReturnType<typeof createFakeResearchRun>): string {
  const citations = run.evidenceRegistry.getCitationEligibleSources().slice(0, 30).map((source) => run.evidenceRegistry.getCitationMarkdown(source.id)).join(" ");
  return [
    "# Executive Thesis",
    `Treasury Bench and Opposition should frame the issue as constitutional challenge, Election Commission defence, Supreme Court doctrine, Union ministry accountability, public order, rights-based challenge, POIs, rebuttals, motions, amendments, committee recommendations, resolution clauses, central contradiction, and strategic synthesis. ${citations}`,
    "## Methodology and Source Base",
    `Registry citations only. ${citations}`,
    "## Research Angle Map",
    "Treasury Bench, Opposition, courts, ministries, and Election Commission positions are separated.",
    "## Indian Mock Parliament Debate Utility Arsenal",
    `Treasury Bench arguments and Opposition arguments use source-grounded POIs and rebuttals. Motions, amendments, operative clause, and preambular clause language are included. ${citations}`,
    "## Final Strategic Synthesis",
    `Diagnosis: the central contradiction is proof versus rhetoric. Prescription: use source-backed floor pressure. Warning: do not overclaim. ${citations}`,
  ].join("\n\n");
}

test("Groq 413 triggers compressed retry with a smaller prompt", async () => {
  const run = createFakeResearchRun(30, "fast_research");
  const router = new FakeProviderRouter()
    .script("groq", [{ type: "413" }, { type: "success", content: passingAnswer(run) }]);

  const result = await generateCoreResearchAnswer({
    requestId: "groq-413-retry",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [buildSourceUsageMapFromRegistry("evidence_extractor", run.evidenceRegistry, run.agendaContract, 30)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter: router as any,
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    trustRegisteredProvidersWithoutStatus: true,
  });

  assert.equal(router.calls.filter((call) => call.provider === "groq").length, 2);
  assert.ok(result.promptBudgetReports.some((report) => report.compressionLevel > 0));
  assert.equal(result.usedLegacyFallback, false);
  assert.ok(result.providerFailureReports?.some((report) => report.code === "request_too_large"));
});

test("Groq 429 tries a healthy fallback provider and keeps raw body sanitized", async () => {
  const run = createFakeResearchRun(30, "fast_research");
  const router = new FakeProviderRouter()
    .script("groq", [{ type: "429", message: "Groq 429 org_secret billing https://console.groq.com/settings/billing" }])
    .script("nvidia", [{ type: "success", content: passingAnswer(run) }]);

  const result = await generateCoreResearchAnswer({
    requestId: "groq-429-fallback",
    userQuery: run.agendaContract.originalUserQuery,
    mode: "fast_research",
    agendaContract: run.agendaContract,
    evidenceRegistry: run.evidenceRegistry,
    evidencePacks: run.evidencePacks,
    claimGraph: run.claimGraph,
    sourceUsageMaps: [buildSourceUsageMapFromRegistry("evidence_extractor", run.evidenceRegistry, run.agendaContract, 30)],
    allowSyntheticSourceUsage: true,
    generationMode: "model",
    providerRouter: router as any,
    providerName: "groq",
    model: "llama-3.3-70b-versatile",
    autoFallback: true,
    trustRegisteredProvidersWithoutStatus: true,
  });

  assert.deepEqual(router.calls.map((call) => call.provider), ["groq", "nvidia"]);
  assert.ok(result.providerFailureReports?.some((report) => report.code === "rate_limited"));
  assert.doesNotMatch(JSON.stringify(result.providerFailureReports), /org_secret|billing|https?:/);
});
