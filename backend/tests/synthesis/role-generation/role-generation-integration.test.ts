import test from "node:test";
import assert from "node:assert/strict";
import { runModelRoleForSourceUsage } from "../../../src/core/synthesis/model-role-runner.js";
import { makeCard, makeClaimGraph, makeRegistry, testAgenda } from "./helpers.js";
import type { ProviderRouter } from "../../../src/core/providers/provider-router.js";

test("role generation integration sends role-specific prompt context to provider", async () => {
  const cards = [makeCard(1, { keyFacts: ["The second chunk fact supports the legal proportionality argument."] })];
  const seen: string[] = [];
  const providerRouter = {
    hasProvider: () => true,
    complete: async (_provider: string, request: any) => {
      seen.push(request.messages.map((message: any) => message.content).join("\n\n"));
      return {
        provider: "gemini",
        model: "test",
        content: JSON.stringify({
          sourceUsageMap: [{
            sourceId: 1,
            usageType: "fact_extracted",
            extractedClaim: "The second chunk fact supports the legal proportionality argument.",
            supportedSection: "evidence_verification",
            confidence: "medium",
          }],
        }),
      };
    },
  } as unknown as ProviderRouter;

  const output = await runModelRoleForSourceUsage({
    roleName: "legal_analyst",
    evidenceCards: cards,
    evidenceRegistry: makeRegistry(cards),
    agendaContract: testAgenda(),
    mode: "model",
    providerRouter,
    providerName: "gemini",
    model: "test",
    minimumSourceRequirement: 1,
    claimGraph: makeClaimGraph(),
    researchMode: "deep_research",
  });

  assert.equal(output.sourceUsageRequirementSatisfied, true);
  assert.match(seen.join("\n"), /constitutional provisions|Supreme Court|High Court|ECI/i);
  assert.match(seen.join("\n"), /ClaimGraph Context/i);
  assert.match(seen.join("\n"), /\[2\] Second chunk/);
  assert.match(JSON.stringify(output.output), /schemaVersion|roleSummary|sourceQualityFindings/);
});
