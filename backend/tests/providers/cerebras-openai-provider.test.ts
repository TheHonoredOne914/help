import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { isCerebrasEnabled, getCerebrasClient, CEREBRAS_CATALOG } from "../../src/lib/cerebras-client.js";

describe("Cerebras provider", () => {
  it("should not be enabled without key", () => {
    const prev = process.env.CEREBRAS_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    assert.equal(isCerebrasEnabled(), false);
    assert.equal(isCerebrasEnabled(""), false);
    assert.equal(isCerebrasEnabled(null), false);
    process.env.CEREBRAS_API_KEY = prev;
  });

  it("should be enabled with env key", () => {
    const prev = process.env.CEREBRAS_API_KEY;
    process.env.CEREBRAS_API_KEY = "test-key";
    assert.equal(isCerebrasEnabled(), true);
    process.env.CEREBRAS_API_KEY = prev;
  });

  it("should be enabled with override key", () => {
    assert.equal(isCerebrasEnabled("override-key"), true);
  });

  it("should throw without API key", () => {
    const prev = process.env.CEREBRAS_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    assert.throws(() => getCerebrasClient(), /API key is required/);
    process.env.CEREBRAS_API_KEY = prev;
  });

  it("should have catalog models", () => {
    assert.ok(CEREBRAS_CATALOG.length > 0);
    assert.ok(CEREBRAS_CATALOG[0].id.includes("llama"));
  });
});

