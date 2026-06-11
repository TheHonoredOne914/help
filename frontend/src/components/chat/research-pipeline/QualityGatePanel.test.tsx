import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { QualityGatePanel } from "./QualityGatePanel";

test("QualityGatePanel handles null safely", () => {
  assert.equal(renderToStaticMarkup(<QualityGatePanel gate={null} />), "");
});

test("QualityGatePanel failed state does not render as successful", () => {
  const html = renderToStaticMarkup(<QualityGatePanel gate={{
    passed: false,
    score: 42,
    repairRequired: true,
    automaticFailures: ["citations_missing"],
    warnings: ["source_gap"],
  }} />);

  assert.match(html, /Repair required/);
  assert.match(html, /citations missing/);
  assert.doesNotMatch(html, /Passed/);
});
