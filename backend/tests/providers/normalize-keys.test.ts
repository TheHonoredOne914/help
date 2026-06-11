import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApiKeys } from "../../src/lib/normalize-keys.js";

const touchedKeys = [
  "GROQ_API_KEY",
  "GROQ_API_KEY_1",
  "GROQ_API_KEY_2",
  "GROQ_API_KEY_3",
  "TAVILY_API_KEY",
  "TAVILY_API_KEY_1",
  "TAVILY_API_KEY_2",
  "TAVILY_API_KEY_3",
  "OPENROUTER_API_KEY",
  "OPENROUTER_API_KEY_1",
  "OPENROUTER_API_KEY_2",
  "OPENROUTER_KEY",
];

function withCleanEnv(run: () => void): void {
  const backup = new Map(touchedKeys.map((key) => [key, process.env[key]]));
  for (const key of touchedKeys) delete process.env[key];
  try {
    run();
  } finally {
    for (const key of touchedKeys) {
      const value = backup.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("normalizeApiKeys promotes numbered slots into comma-separated fallback lists", () => {
  withCleanEnv(() => {
    process.env.GROQ_API_KEY_1 = "gsk-one";
    process.env.GROQ_API_KEY_2 = "gsk-two";
    process.env.GROQ_API_KEY_3 = "your_groq_api_key_3";
    process.env.TAVILY_API_KEY_1 = "tvly-one";
    process.env.TAVILY_API_KEY_2 = "tvly-two";
    process.env.OPENROUTER_API_KEY_1 = "or-one";
    process.env.OPENROUTER_API_KEY_2 = "or-two";

    normalizeApiKeys();

    assert.equal(process.env.GROQ_API_KEY, "gsk-one,gsk-two");
    assert.equal(process.env.TAVILY_API_KEY, "tvly-one,tvly-two");
    assert.equal(process.env.OPENROUTER_API_KEY, "or-one,or-two");
    assert.equal(process.env.OPENROUTER_KEY, "or-one,or-two");
  });
});
