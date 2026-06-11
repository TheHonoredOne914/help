import assert from "node:assert/strict";
import { test } from "node:test";

import { runDimensionEngine } from "../src/lib/dimension-engine.ts";
import { buildEvidenceRegistry } from "../src/lib/evidence-registry.ts";
import { runQualityGate } from "../src/lib/quality-gate.ts";
import { runDivisionPipeline, type ModelPoolEntry } from "../src/services/division-engine.ts";

function mockModelPool(): ModelPoolEntry[] {
  const client = {
    chat: {
      completions: {
        create: async ({ messages }: { messages: Array<{ content: string }> }) => {
          const prompt = messages[0]?.content ?? "";
          const divisionMatch = prompt.match(/DIVISION\s+(\d+)/i);
          const divisionNumber = divisionMatch?.[1] ?? "1";
          const isStrategic = /STRATEGIC INSIGHTS/i.test(prompt);
          const referencesDebate = /debate utility|DIVISION 7|POI arsenal/i.test(prompt);
          const content = isStrategic && referencesDebate
            ? "Division 11 strategic synthesis references Division 7 debate utility and POI leverage."
            : `Division ${divisionNumber} generated content with parliamentary evidence and citations.`;

          return { choices: [{ message: { content } }] };
        },
      },
    },
  };

  return [{ client, modelId: "mock-best-model" }, { client, modelId: "mock-worker-model" }];
}

function streamingMockModelPool(): ModelPoolEntry[] {
  const client = {
    chat: {
      completions: {
        create: async ({ stream }: { stream?: boolean }) => {
          if (stream) {
            return (async function* () {
              yield { choices: [{ delta: { content: "streamed " } }] };
              yield { choices: [{ delta: { content: "division content" } }] };
            })();
          }
          return { choices: [{ message: { content: "non-streamed division content" } }] };
        },
      },
    },
  };

  return [{ client, modelId: "mock-streaming-model" }];
}

test("runDivisionPipeline returns all eleven divisions", async () => {
  const engine = runDimensionEngine("Article 21 privacy Supreme Court parliamentary accountability", "constitutional");
  const registry = buildEvidenceRegistry([], engine.agendaText);

  const { divisions } = await runDivisionPipeline(engine, registry, mockModelPool());

  assert.equal(divisions.size, 11);
});

test("division eleven output references content from division seven", async () => {
  const engine = runDimensionEngine("Article 21 privacy Supreme Court parliamentary accountability", "constitutional");
  const registry = buildEvidenceRegistry([], engine.agendaText);

  const { divisions } = await runDivisionPipeline(engine, registry, mockModelPool());

  assert.match(divisions.get("strategic_insights") ?? "", /Division 7 debate utility/i);
});

test("assembled briefing headers are matchable by quality gate regex", async () => {
  const engine = runDimensionEngine("Article 21 privacy Supreme Court parliamentary accountability", "constitutional");
  const registry = buildEvidenceRegistry([], engine.agendaText);

  const { assembledBriefing } = await runDivisionPipeline(engine, registry, mockModelPool());
  const report = runQualityGate(assembledBriefing, engine, registry);

  assert.equal(report.divisionReports.length, 11);
  assert.ok(report.divisionReports.every((division) => division.wordCount > 0));
});

test("division pipeline completes within one hundred twenty seconds with mock model pool", async () => {
  const engine = runDimensionEngine("Article 21 privacy Supreme Court parliamentary accountability", "constitutional");
  const registry = buildEvidenceRegistry([], engine.agendaText);
  const started = Date.now();

  await runDivisionPipeline(engine, registry, mockModelPool());

  assert.ok(Date.now() - started < 120_000);
});

test("division pipeline emits progressive synthesis chunks when a chunk callback is supplied", async () => {
  const engine = runDimensionEngine("Article 21 privacy Supreme Court parliamentary accountability", "constitutional");
  const registry = buildEvidenceRegistry([], engine.agendaText);
  const chunks: Array<{ divisionId: string; chunk: string }> = [];

  await runDivisionPipeline(engine, registry, streamingMockModelPool(), {
    onDivisionChunk: (divisionId, chunk) => chunks.push({ divisionId, chunk }),
  });

  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].divisionId, "core_brief");
  assert.equal(chunks[0].chunk, "streamed ");
  assert.ok(chunks.some((event) => event.chunk === "division content"));
});
