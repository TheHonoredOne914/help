import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("dev server avoids the broken no-optimizer Vite runtime path", async () => {
  const source = await readFile(new URL("./dev.mjs", import.meta.url), "utf8");
  const chatArea = await readFile(new URL("./src/components/chat/chat-area.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("./src/components/chat/sidebar.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /disabled\s*:\s*true/);
  assert.doesNotMatch(source, /noDiscovery\s*:\s*true/);
  assert.match(source, /responseHeaders\.delete\(["']content-encoding["']\)/);
  assert.match(source, /responseHeaders\.delete\(["']content-length["']\)/);
  assert.doesNotMatch(chatArea, /from\s+["']date-fns["']/);
  assert.doesNotMatch(sidebar, /from\s+["']date-fns["']/);
});

test("provider key save refreshes every model route with the current form keys", async () => {
  const settingsDialog = await readFile(new URL("./src/components/chat/settings-dialog.tsx", import.meta.url), "utf8");
  const chatArea = await readFile(new URL("./src/components/chat/chat-area.tsx", import.meta.url), "utf8");
  const providerHook = await readFile(new URL("./src/hooks/use-provider-models.tsx", import.meta.url), "utf8");
  const providerTypes = await readFile(new URL("./src/hooks/provider-models/provider-types.ts", import.meta.url), "utf8");
  const providerKeys = await readFile(new URL("./src/lib/provider-keys.ts", import.meta.url), "utf8");

  assert.match(settingsDialog, /CustomEvent\("bestdel:provider-keys-updated",[\s\S]*changedAt:[\s\S]*forceRefresh:\s*true/);
  assert.match(settingsDialog, /useProviderModels/);
  assert.match(settingsDialog, /refreshAllProviders\(loadedKeys\)/);
  assert.match(settingsDialog, /currentConfigured/);
  assert.match(settingsDialog, /effectiveConfigured/);
  assert.match(chatArea, /useProviderModels/);
  assert.match(chatArea, /bottom-\[calc\(100%\+0\.5rem\)\]/);
  assert.match(chatArea, /data-testid="input-model-search"/);
  assert.match(chatArea, /data-testid="button-save-models"/);
  assert.doesNotMatch(chatArea, /const\s+refreshProviderModels\s*=\s*useCallback/);
  assert.match(providerHook, /export function useProviderModels/);
  assert.match(providerHook, /window\.addEventListener\("bestdel:provider-keys-updated"/);
  assert.match(providerHook, /window\.addEventListener\("storage"/);
  assert.match(providerHook, /healthyResearchModels/);
  assert.match(providerHook, /from "\.\/provider-models"/);

  for (const route of ["groq", "nvidia", "ollama", "gemini", "openrouter", "github"]) {
    assert.match(providerTypes, new RegExp(`MODEL_PROVIDERS[\\s\\S]*["']${route}["']`));
  }
  assert.match(providerHook, /apiFetchWithTimeout\(`\$\{base\}\/api\/\$\{provider\}\/models\?refresh=\$\{refreshToken\}`, \{ headers: providerHeaders \}/);
  assert.match(providerHook, /apiFetch\(input, \{ \.\.\.init, cache: "no-store"/);

  assert.match(providerHook, /getProviderHeadersFromKeys\(keys\)/);
  assert.match(providerHook, /setProviderModels\(\(prev\)/);
  assert.match(providerKeys, /exaApiKey: string/);
  assert.match(providerKeys, /firecrawlApiKey: string/);
  assert.match(providerKeys, /X-Exa-Api-Key/);
  assert.match(providerKeys, /X-Firecrawl-Api-Key/);
  assert.match(settingsDialog, /id="exa-key"/);
  assert.match(settingsDialog, /id="firecrawl-key"/);
  assert.match(providerTypes, /"exa"/);
  assert.match(providerTypes, /"firecrawl"/);
});

test("provider model refresh accepts 200 payloads that return model ids as strings", async () => {
  const providerHook = await readFile(new URL("./src/hooks/use-provider-models.tsx", import.meta.url), "utf8");
  const modelNormalizer = await readFile(new URL("./src/hooks/provider-models/provider-model-normalizer.ts", import.meta.url), "utf8");
  const statusNormalizer = await readFile(new URL("./src/hooks/provider-models/provider-status-normalizer.ts", import.meta.url), "utf8");

  assert.match(modelNormalizer, /export function extractRawModels\(raw: unknown\): unknown\[\]/);
  assert.match(modelNormalizer, /payload\.models/);
  assert.match(modelNormalizer, /payload\.data/);
  assert.match(modelNormalizer, /payload\.items/);
  assert.match(modelNormalizer, /typeof\s+rawModel\s*===\s*["']string["']/);
  assert.match(modelNormalizer, /normalizeProviderNativeModelId\(provider,\s*rawModel\)/);
  assert.match(providerHook, /statusFromSuccessfulModelRoute\(provider,\s*normalizeProviderStatus\(provider,\s*statusPayload\),\s*returnedModels\)/);
  assert.match(providerHook, /const models = \(status\.availableForDisplay \?\? isProviderDisplayable\(status,\s*returnedModels\)\) \? returnedModels : \[\]/);
  assert.match(statusNormalizer, /availableForDisplay: isProviderDisplayable\(next,\s*models\)/);
});

test("light chat shell keeps assistant text visible and welcome glint scoped", async () => {
  const indexHtml = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const chatArea = await readFile(new URL("./src/components/chat/chat-area.tsx", import.meta.url), "utf8");
  const indexCss = await readFile(new URL("./src/index.css", import.meta.url), "utf8");

  assert.doesNotMatch(indexHtml, /<html[^>]*class=["'][^"']*\bdark\b/);
  assert.doesNotMatch(chatArea, /text-neutral-900\s+dark:prose-invert\s+dark:text-neutral-100/);
  assert.match(chatArea, /assistant-bubble rounded-2xl rounded-tl-sm text-foreground/);
  assert.match(chatArea, /from\s+["']\.\/cursor-glint["']/);
  assert.match(chatArea, /<CursorGlint\s*\/>/);
  assert.doesNotMatch(chatArea, /<div className=["']hidden["']>\s*[\s\S]*data-testid=["']char-counter["']/);
  assert.doesNotMatch(chatArea, />\{input\.length\}\/4000<\/span>/);

  assert.match(indexCss, /\.cursor-glint\s*\{/);
  assert.equal(indexCss.match(/^\.feature-card\s*\{/gm)?.length ?? 0, 1);
  assert.equal(indexCss.match(/^\.accent-gradient-bg\s*\{/gm)?.length ?? 0, 1);
  assert.equal(indexCss.match(/^@keyframes wandShimmer\b/gm)?.length ?? 0, 1);
  assert.doesNotMatch(indexCss, /assistant-fade-in\s*>\s*\*\s*\{[\s\S]*token-fade-in/);
});

test("chat composer hierarchy stays compact and message bubbles keep readable measure", async () => {
  const chatArea = await readFile(new URL("./src/components/chat/chat-area.tsx", import.meta.url), "utf8");
  const chatComposer = await readFile(new URL("./src/components/chat/ChatComposer.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(chatArea, /const resizeComposerInput = useCallback/);
  assert.doesNotMatch(chatArea, /el\.style\.height = "auto"/);
  assert.doesNotMatch(chatArea, /Math\.min\(Math\.max\(el\.scrollHeight,\s*72\),\s*176\)/);
  assert.match(chatArea, /<ChatComposer\b/);
  assert.match(chatArea, /focusRef=\{composerFocusRef\}/);
  assert.match(chatArea, /composerFocusRef\.current\?\.\(\)/);
  assert.match(chatArea, /showLiveResearchRun/);
  assert.match(chatArea, /data-testid="button-toggle-live-research"/);
  assert.match(chatArea, /activeChip=/);
  assert.match(chatArea, /onSelectChip=/);
  assert.match(chatComposer, /rounded-\[24px\]/);
  assert.doesNotMatch(chatComposer, /absolute right-2 bottom-2/);
  assert.match(chatArea, /max-w-\[85ch\]/);
  assert.doesNotMatch(chatArea, /max-w-\[90%\] md:max-w-\[86%\] lg:max-w-\[82%\]/);
});

test("configured frontend test script executes TS and TSX source tests", async () => {
  const packageJson = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts.test, /dev-config\.test\.mjs/);
  assert.match(packageJson.scripts.test, /run-src-tests\.mjs/);
});
