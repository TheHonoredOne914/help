import { GithubProvider } from "../src/core/providers/github-provider.js";
import { ProviderRouter } from "../src/core/providers/provider-router.js";
import { listGithubModels } from "../src/routes/providers.js";

const token = process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN;
if (!token) {
  console.log(JSON.stringify({ ok: false, skipped: true, missing: ["GITHUB_MODELS_API_KEY or GITHUB_TOKEN"] }, null, 2));
  process.exit(0);
}

const models = await listGithubModels(token);
const router = new ProviderRouter();
router.register(new GithubProvider({ apiKey: token }));
const chat = await router.complete("github", {
  model: "openai/gpt-4.1",
  maxTokens: 80,
  messages: [{ role: "user", content: "In one sentence, say BestDel is ready for Indian Mock Parliament research." }],
});
const json = await router.completeJson("github", {
  model: "openai/gpt-4.1",
  maxTokens: 120,
  messages: [{ role: "user", content: "Return only JSON: {\"provider\":\"github\",\"jsonTask\":true}" }],
});

console.log(JSON.stringify({
  ok: true,
  provider: "github",
  model: "openai/gpt-4.1",
  modelCount: models.models.length,
  content: chat.content,
  json: json.json,
  latencyMs: { chat: chat.latencyMs, json: json.latencyMs },
}, null, 2));
