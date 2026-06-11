import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CouncilChamberPanel } from "./council-chamber-panel";
import { makeCouncilSessionFixture } from "./test-fixtures";

test("CouncilChamberPanel renders six councillor cards and the Council response layers", () => {
  const html = renderToStaticMarkup(<CouncilChamberPanel session={makeCouncilSessionFixture()} />);

  assert.equal((html.match(/data-councillor-card=/g) ?? []).length, 6);
  assert.match(html, /Legal Councillor/);
  assert.match(html, /Opposition Councillor/);
  assert.match(html, /Deliberation Layer/);
  assert.match(html, /Floor Strategy Layer/);
  assert.match(html, /Chief Councillor Verdict/);
  assert.match(html, /Final strategy verdict/);
  assert.match(html, /Download Dossier/);
});
