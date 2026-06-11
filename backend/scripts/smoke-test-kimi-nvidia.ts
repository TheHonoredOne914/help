import { listNvidiaModels } from "../src/routes/providers.js";
import { NvidiaProvider } from "../src/core/providers/nvidia-provider.js";
import { ProviderRouter } from "../src/core/providers/provider-router.js";

const key = process.env.NVIDIA_API_KEY;
if (!key) {
  console.log(JSON.stringify({ ok: false, skipped: true, missing: ["NVIDIA_API_KEY"] }, null, 2));
  process.exit(0);
}

const models = await listNvidiaModels(key);
const hasKimi = models.models.some((model) => model.id === "moonshotai/kimi-k2.6");
if (!hasKimi) {
  console.log(JSON.stringify({ ok: false, provider: "nvidia", reason: "moonshotai/kimi-k2.6 not returned", source: models.source }, null, 2));
  process.exit(1);
}

const router = new ProviderRouter();
router.register(new NvidiaProvider({ apiKey: key }));
const chat = await router.complete("nvidia", {
  model: "moonshotai/kimi-k2.6",
  maxTokens: 80,
  messages: [{ role: "user", content: "In one sentence, say BestDel is ready for Indian Mock Parliament research." }],
});
const json = await router.completeJson("nvidia", {
  model: "moonshotai/kimi-k2.6",
  maxTokens: 120,
  messages: [{ role: "user", content: "Return only JSON: {\"provider\":\"nvidia\",\"jsonTask\":true}" }],
});

console.log(JSON.stringify({
  ok: true,
  provider: "nvidia",
  model: "moonshotai/kimi-k2.6",
  modelListSource: models.source,
  content: chat.content,
  json: json.json,
  latencyMs: { chat: chat.latencyMs, json: json.latencyMs },
}, null, 2));
