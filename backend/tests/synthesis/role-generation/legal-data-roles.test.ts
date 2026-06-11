import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_DEFINITIONS, SOURCE_USAGE_ROLE_NAMES } from "../../../src/core/synthesis/role-generation/role-definitions.js";
import { buildResearchModelPlan } from "../../../src/core/providers/model-strategy.js";

test("legal_analyst and data_analyst are defined and model-routed", () => {
  const roleIds = ROLE_DEFINITIONS.map((role) => role.name);
  assert.ok(roleIds.includes("legal_analyst"));
  assert.ok(roleIds.includes("data_analyst"));
  assert.ok(SOURCE_USAGE_ROLE_NAMES.includes("legal_analyst"));
  assert.ok(SOURCE_USAGE_ROLE_NAMES.includes("data_analyst"));

  const plan = buildResearchModelPlan({ runId: "roles", mode: "deep_research" });
  assert.ok(plan.assignments.some((assignment) => assignment.role === "legal_analyst"));
  assert.ok(plan.assignments.some((assignment) => assignment.role === "data_analyst"));
});
