import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FloorStrategyPanel } from "./floor-strategy-panel";
import { makeCouncilSessionFixture } from "./test-fixtures";

test("FloorStrategyPanel renders committee-ready strategy sections", () => {
  const session = makeCouncilSessionFixture();
  const html = renderToStaticMarkup(<FloorStrategyPanel verdict={session.verdict} />);

  assert.match(html, /Floor Strategy Layer/);
  assert.match(html, /Opening Arguments/);
  assert.match(html, /Lines To Avoid/);
  assert.match(html, /POIs And Timing/);
  assert.match(html, /Treasury vs Opposition Clash Map/);
});
