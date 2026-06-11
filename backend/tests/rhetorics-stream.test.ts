import test from "node:test";
import assert from "node:assert/strict";

import { streamRhetoricsResponse } from "../src/routes/anthropic.ts";

test("streamRhetoricsResponse returns the full streamed text for persistence", async () => {
  const sent: unknown[] = [];
  const client = {
    chat: {
      completions: {
        create: async function* () {
          yield { choices: [{ delta: { content: "Kavita " } }] };
          yield { choices: [{ delta: { content: "stays." } }] };
        },
      },
    },
  };

  const fullText = await streamRhetoricsResponse(
    client,
    "system",
    [],
    "write kavita",
    0.8,
    (data) => sent.push(data),
    { geminiKey: null } as any,
  );

  assert.equal(fullText, "Kavita stays.");
  assert.deepEqual(sent, [{ content: "Kavita " }, { content: "stays." }]);
});
