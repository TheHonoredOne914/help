import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeliberationBoard } from "./deliberation-board";
import { makeCouncilSessionFixture } from "./test-fixtures";

test("DeliberationBoard renders seals, conflict lines, and the 3+ council badge", () => {
  const session = makeCouncilSessionFixture();
  const html = renderToStaticMarkup(<DeliberationBoard seals={session.seals} disputes={session.disputes} agreementScore={72} />);

  assert.match(html, /Council Seals/);
  assert.match(html, /3\+ council support/);
  assert.match(html, /Federalism claim/);
  assert.match(html, /Conflict Lines/);
});
