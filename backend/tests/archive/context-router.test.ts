import test from "node:test";
import assert from "node:assert/strict";
import { routeQueryAgainstWorkspace } from "../../src/core/archive/context-router.js";

test("press freedom attaches to an India democratic-space archive", () => {
  const route = routeQueryAgainstWorkspace("press freedom and information space", {
    title: "India democratic space",
    summary: "Freedom House, V-Dem, UAPA, FCRA, press freedom, electoral integrity, civil liberties",
  });

  assert.equal(route.relationType, "core_related");
  assert.equal(route.suggestedAction, "attach_to_workspace");
  assert.equal(route.shouldAskUser, false);
});

test("marital rape law becomes a subtopic with user confirmation when confidence is medium", () => {
  const route = routeQueryAgainstWorkspace("marital rape law and Supreme Court doctrine", {
    title: "India democratic space",
    summary: "constitutional rights, civil liberties, Supreme Court, democratic institutions",
  });

  assert.equal(route.relationType, "subtopic_related");
  assert.equal(route.suggestedAction, "create_subthread");
  assert.equal(route.shouldAskUser, true);
});

test("unrelated archive context is isolated", () => {
  const route = routeQueryAgainstWorkspace("best gaming phone under 30000", {
    title: "India democratic space",
    summary: "press freedom, civil liberties, electoral integrity",
  });

  assert.equal(route.relationType, "unrelated");
  assert.equal(route.suggestedAction, "temporary_isolated_response");
});
