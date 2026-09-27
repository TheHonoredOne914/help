import test from "node:test";
import assert from "node:assert/strict";
import { inferredBucketIdsForClass, mergeBucketIds } from "../../src/core/retrieval/bucketed-retrieval.js";

test("inferredBucketIdsForClass maps indian_major_media to indian_major_media bucket", () => {
  assert.deepEqual(inferredBucketIdsForClass("indian_major_media"), ["indian_major_media"]);
});

test("inferredBucketIdsForClass maps court_primary to court_legal bucket", () => {
  assert.deepEqual(inferredBucketIdsForClass("court_primary"), ["court_legal"]);
});

test("inferredBucketIdsForClass returns empty for unknown or low_quality classes", () => {
  assert.deepEqual(inferredBucketIdsForClass("low_quality"), []);
  assert.deepEqual(inferredBucketIdsForClass("social_media"), []);
  assert.deepEqual(inferredBucketIdsForClass(undefined), []);
  assert.deepEqual(inferredBucketIdsForClass("not_a_real_class"), []);
});

test("mergeBucketIds puts inferred class bucket first", () => {
  const ids = mergeBucketIds("government_official", "indian_major_media");
  assert.equal(ids[0], "indian_major_media");
  assert.ok(ids.includes("government_official"));
});

test("mergeBucketIds keeps query bucket primary when no inferred bucket", () => {
  const ids = mergeBucketIds("court_legal", "low_quality");
  assert.equal(ids[0], "court_legal");
});
