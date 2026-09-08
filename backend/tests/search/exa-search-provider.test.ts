import test from "node:test";
import assert from "node:assert/strict";
import { exaSearchProvider } from "../../src/core/search/providers/exa-search-provider.js";

test("exa search POST body includes contents.text.maxCharacters", async () => {
  let capturedBody: Record<string, unknown> | null = null;
  await exaSearchProvider.search(
    { query: "India election deepfakes", maxResults: 3 },
    { exa: "exa-test-key" },
    {
      fetchFn: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            results: [
              {
                title: "Example",
                url: "https://example.com/a",
                text: "Snippet text about elections.",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );

  assert.ok(capturedBody);
  const contents = capturedBody.contents as { text?: { maxCharacters?: number } } | undefined;
  assert.equal(contents?.text?.maxCharacters, 2000);
});
