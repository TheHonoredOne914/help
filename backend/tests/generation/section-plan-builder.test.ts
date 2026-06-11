import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaContract } from "../../src/core/agenda/agenda-contract.js";
import { buildSectionPlan } from "../../src/core/generation/section-plan-builder.js";
import { runDimensionEngine } from "../../src/lib/dimension-engine.js";

test("section plan is agenda dynamic", () => {
  const security = buildAgendaContract({ originalUserQuery: "Lok Sabha debate on AFSPA public order and Article 21 safeguards" });
  security.topicType = "indian_security_policy";
  const economic = buildAgendaContract({ originalUserQuery: "Lok Sabha debate on GST fiscal federalism and budget impact" });
  economic.topicType = "indian_economic_policy";

  const securitySections = buildSectionPlan(security, runDimensionEngine(security.originalUserQuery, "national_security"));
  const economicSections = buildSectionPlan(economic, runDimensionEngine(economic.originalUserQuery, "economic"));

  assert.ok(securitySections.includes("National Security and Public Order Analysis"));
  assert.ok(securitySections.includes("Civil Liberties vs Security"));
  assert.ok(economicSections.includes("Budget and Fiscal Analysis"));
  assert.ok(economicSections.includes("Stakeholder Economic Impact"));
  assert.ok(!economicSections.includes("Democracy Indices and Measurement"));
});
