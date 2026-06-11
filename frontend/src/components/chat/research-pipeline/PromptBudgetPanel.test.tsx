import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptBudgetPanel } from "./PromptBudgetPanel";

test("PromptBudgetPanel renders compact budget fields without raw JSON", () => {
  const html = renderToStaticMarkup(<PromptBudgetPanel report={{
    providerName: "nvidia",
    model: "moonshotai/kimi-k2.6",
    estimatedInputTokens: 1000,
    maxInputTokens: 8000,
    compressionApplied: true,
    compressionLevel: 2,
    includedSources: 8,
    originalSources: 12,
    includedPacks: 2,
    originalPacks: 3,
  }} />);

  assert.match(html, /nvidia\/moonshotai\/kimi-k2\.6/);
  assert.match(html, /1000\/8000 tokens/);
  assert.match(html, /compression 2/);
  assert.doesNotMatch(html, /\{&quot;|\{"providerName"/);
});
