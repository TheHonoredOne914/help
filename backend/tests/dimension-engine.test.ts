import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTokenBudgetMap, detectPrimaryThreshold, runDimensionEngine } from "../src/lib/dimension-engine.ts";

test("privacy versus surveillance activates constitutional, human rights, and technological dimensions", () => {
  const engine = runDimensionEngine(
    "Right to Privacy vs State Surveillance under Article 21, Aadhaar, DPDP Act and minority rights",
    "constitutional",
  );

  const primary = engine.primaryDimensions.map((d) => d.name);

  assert.equal(engine.agendaClass, "rights_constitutional");
  assert.ok(primary.includes("human_rights"));
  assert.ok([...engine.primaryDimensions, ...engine.secondaryDimensions].some((dimension) => dimension.name === "technological"));
  assert.ok([...engine.primaryDimensions, ...engine.secondaryDimensions].some((dimension) => dimension.name === "constitutional"));
});

test("India China border tensions activate security, diplomatic, and strategic affairs", () => {
  const engine = runDimensionEngine(
    "India-China border tensions, standoff, Indo-Pacific strategic autonomy and diplomatic crisis",
    "foreign_affairs",
  );

  const primary = engine.primaryDimensions.map((d) => d.name);

  assert.ok(primary.includes("diplomatic"));
  assert.ok(primary.includes("strategic_affairs"));
  assert.ok([...engine.primaryDimensions, ...engine.secondaryDimensions].some((dimension) => dimension.name === "security"));
});

test("AIPPM committee overlay gives federalism a forty point boost", () => {
  const engine = runDimensionEngine("GST Council disputes and state autonomy", "aippm");
  const federalism = engine.primaryDimensions.find((d) => d.name === "federalism");

  assert.ok(federalism);
  assert.ok(federalism.boostedScore >= federalism.rawScore + 40);
});

test("crisis committee activates social stability and security even with sparse agenda keywords", () => {
  const engine = runDimensionEngine("Emergency committee on fast-moving unrest", "crisis");
  const active = [...engine.primaryDimensions, ...engine.secondaryDimensions].map((d) => d.name);

  assert.ok(active.includes("social_stability"));
  assert.ok(active.includes("security"));
});

test("conflict signals elevate constitutional issues", () => {
  const engine = runDimensionEngine("A policy challenged as unconstitutional in an ongoing PIL", "general");
  const constitutional = engine.primaryDimensions.find((d) => d.name === "constitutional");

  assert.ok(engine.conflictSignals.includes("ongoing_constitutional_challenge"));
  assert.ok(constitutional);
  assert.ok(constitutional.boostedScore >= 25);
});

test("dynamic primary threshold detects the elbow and caps primary dimensions", () => {
  const count = detectPrimaryThreshold([
    ["political", 100],
    ["governance", 90],
    ["constitutional", 80],
    ["economic", 70],
    ["security", 35],
    ["human_rights", 30],
    ["judiciary", 20],
  ]);

  assert.equal(count, 4);
});

test("general committee applies baseline boosts and filters low-confidence dimensions", () => {
  const engine = runDimensionEngine("General discussion", "general");
  const active = [...engine.primaryDimensions, ...engine.secondaryDimensions].map((d) => d.name);

  assert.ok(active.includes("political"));
  assert.ok(active.includes("governance"));
  assert.ok(!active.includes("constitutional"));
});

test("youth parliament committee type is supported", () => {
  const engine = runDimensionEngine("Youth debate on constitutional accountability", "youth_parliament");
  assert.equal(engine.committeeType, "youth_parliament");
  assert.ok(engine.primaryDimensions.some((d) => d.name === "political" || d.name === "constitutional"));
});

test("elbow detection returns two for binary-focused constitutional judiciary agendas", () => {
  const count = detectPrimaryThreshold([
    ["constitutional", 100],
    ["judiciary", 92],
    ["political", 55],
    ["governance", 45],
    ["economic", 35],
  ]);

  assert.equal(count, 2);
});

test("dimension confidence filter removes dimensions below fifteen", () => {
  const engine = runDimensionEngine("Article 21 Supreme Court judicial review", "general");
  const allDimensions = [
    ...engine.primaryDimensions,
    ...engine.secondaryDimensions,
    ...engine.backgroundDimensions,
  ];

  assert.ok(allDimensions.every((dimension) => dimension.boostedScore >= 15));
});

test("token budget proportional allocation stays within total budget", () => {
  const engine = runDimensionEngine("GST Council state autonomy budget dispute", "aippm");
  const totalBudget = 4096;
  const budget = buildTokenBudgetMap(engine, totalBudget);
  const allocated = [...budget.values()].reduce((sum, value) => sum + value, 0);

  assert.ok(allocated <= totalBudget);
});

test("AIPPM committee type produces combative debate register", () => {
  const engine = runDimensionEngine("GST Council state autonomy and coalition floor fight", "aippm");

  assert.equal(engine.structuralDNA.debateRegister, "combative");
});
