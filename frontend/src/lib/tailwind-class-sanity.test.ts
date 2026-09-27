import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { scanSourceForMalformedTailwindClasses } from "./tailwind-class-sanity";

const SRC_ROOT = join(process.cwd(), "src");

test("frontend/src has no malformed Tailwind arbitrary-value classes", () => {
  const matches = scanSourceForMalformedTailwindClasses(SRC_ROOT);
  if (matches.length > 0) {
    const report = matches
      .map((m) => `  ${m.file}:${m.line} [${m.patternId}] ${m.excerpt}`)
      .join("\n");
    assert.fail(`Malformed Tailwind classes found:\n${report}`);
  }
});
