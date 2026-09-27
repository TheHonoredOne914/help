import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePasswordStrength } from "./password-strength";

test("rejects short passwords", () => {
  const r = evaluatePasswordStrength("Ab1!");
  assert.equal(r.ok, false);
  assert.equal(r.checks.minLength, false);
});

test("rejects letters-only long passwords", () => {
  const r = evaluatePasswordStrength("abcdefgh");
  assert.equal(r.ok, false);
  assert.ok(r.score <= 2);
});

test("accepts fair mixed passwords", () => {
  const r = evaluatePasswordStrength("Abcdef1!");
  assert.equal(r.ok, true);
  assert.ok(r.score >= 3);
});

test("scores longer mixed passwords as strong", () => {
  const r = evaluatePasswordStrength("CorrectHorse1!");
  assert.equal(r.ok, true);
  assert.equal(r.level, "strong");
});
