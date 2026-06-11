import test from "node:test";
import assert from "node:assert/strict";

import { allocateQueryBudgetByDimension } from "../src/services/anthropic-service.ts";
import { generateSequentialDivisions, buildDivision11SpecializedPrompt, type ModelPoolEntry } from "../src/services/division-engine.ts";
import { buildEvidenceRegistry } from "../src/lib/evidence-registry.ts";
import { runDimensionEngine, detectPrimaryThreshold } from "../src/lib/dimension-engine.ts";
import type { DimensionEngineOutput, DimensionName, EvidenceRegistry } from "../src/lib/types.ts";

function buildMockEngine(dimensions: DimensionName[]): DimensionEngineOutput {
  const engine = runDimensionEngine("Article 356 governor role and accountability", "aippm");
  return {
    ...engine,
    primaryDimensions: dimensions.map((name, index) => ({
      name,
      class: "structural" as const,
      rawScore: 100 - index,
      boostedScore: 100 - index,
      priority: "primary" as const,
      triggerKeywords: [name],
    })),
  };
}

function buildMockPlannedQueries() {
  return {
    data_analyst: ["seed data query"],
    legal_researcher: ["seed legal query"],
    policy_analyst: ["seed policy query"],
    current_affairs: ["seed current query"],
    media_journalist: ["seed media query"],
  };
}

function buildMockRegistry(): EvidenceRegistry {
  return buildEvidenceRegistry([], "Article 356 governor role");
}

function buildMockClient() {
  return {
    chat: {
      completions: {
        create: async ({ messages }: { messages: Array<{ content: string }> }) => {
          const prompt = messages[0]?.content ?? "";
          const match = prompt.match(/DIVISION\s+(\d+)/i);
          return {
            choices: [{
              message: {
                content: `Division ${match?.[1] ?? "1"} mock output with cited parliamentary analysis [Source 1](https://example.com).`,
              },
            }],
          };
        },
      },
    },
  };
}

test("allocateQueryBudgetByDimension appends constitutional queries to legal researcher", () => {
  const result = allocateQueryBudgetByDimension(buildMockEngine(["constitutional", "political"]), buildMockPlannedQueries());

  assert.ok(result.legal_researcher.some((query) => query.includes("indiankanoon")));
});

test("allocateQueryBudgetByDimension does not mutate its input object", () => {
  const planned = buildMockPlannedQueries();
  const before = JSON.stringify(planned);

  allocateQueryBudgetByDimension(buildMockEngine(["economic"]), planned);

  assert.equal(JSON.stringify(planned), before);
});

test("generateSequentialDivisions completes all eleven divisions with mock model pool", async () => {
  const model: ModelPoolEntry = { client: buildMockClient(), modelId: "test-model" };
  const result = await generateSequentialDivisions(buildMockEngine(["political", "constitutional"]), buildMockRegistry(), [model]);

  assert.equal(result.size, 11);
  assert.equal(result.has("strategic_insights"), true);
});

test("buildDivision11SpecializedPrompt includes cross-model discussion context", () => {
  const prompt = buildDivision11SpecializedPrompt(
    buildMockEngine(["constitutional"]),
    new Map([["debate_utility", "Division 7 red line context"]]),
    buildMockRegistry(),
    "Cross-model discussion says coalition risk is the hidden leverage point.",
  );

  assert.match(prompt, /CROSS-MODEL RESEARCH SYNTHESIS/i);
  assert.match(prompt, /coalition risk is the hidden leverage point/i);
});

test("detectPrimaryThreshold returns broader coverage when scores are tied", () => {
  const flatScores: [DimensionName, number][] = [
    ["political", 100],
    ["constitutional", 98],
    ["economic", 97],
    ["security", 96],
    ["human_rights", 95],
    ["governance", 94],
  ];

  assert.ok(detectPrimaryThreshold(flatScores) >= 4);
});
