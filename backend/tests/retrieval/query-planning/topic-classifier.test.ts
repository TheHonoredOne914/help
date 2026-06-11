import test from "node:test";
import assert from "node:assert/strict";

import { classifyIndianParliamentaryTopic } from "../../../src/core/retrieval/query-planning/topic-classifier.js";

test("food and water security are not misclassified as defence security policy", () => {
  assert.notEqual(classifyIndianParliamentaryTopic("food security, PDS reform, and MSP in India").topicType, "indian_security_policy");
  assert.notEqual(classifyIndianParliamentaryTopic("water security and interstate river disputes in India").topicType, "indian_security_policy");
});

test("China-related industrial policy is not classified as pure foreign policy", () => {
  const result = classifyIndianParliamentaryTopic("China-related industrial policy, PLI, semiconductors, and Indian manufacturing");

  assert.notEqual(result.topicType, "foreign_policy_india");
  assert.ok(result.confidence >= 0.5);
});

test("expanded classifier recognizes broad Indian parliamentary topic families", () => {
  assert.equal(classifyIndianParliamentaryTopic("gig workers social security code platform labour India").topicType, "labour_gig_economy");
  assert.equal(classifyIndianParliamentaryTopic("DPDP Act data protection and AI governance India").topicType, "technology_data_ai_governance");
  assert.equal(classifyIndianParliamentaryTopic("air pollution and climate adaptation policy India").topicType, "environment_climate");
});
