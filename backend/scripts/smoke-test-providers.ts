import { buildProviderStatusPayload } from "../src/routes/providers.js";

const payload = await buildProviderStatusPayload({
  groqKey: process.env.GROQ_API_KEY ?? null,
  ollamaKey: null,
  ollamaBase: null,
  nvidiaKey: process.env.NVIDIA_API_KEY ?? null,
  geminiKey: process.env.GEMINI_API_KEY ?? null,
  openrouterKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY ?? null,
  githubToken: process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? null,
  tavilyKey: process.env.TAVILY_API_KEY ?? null,
  serperKey: process.env.SERPER_API_KEY ?? null,
  exaKey: process.env.EXA_API_KEY ?? null,
  braveKey: process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY ?? null,
  firecrawlKey: process.env.FIRECRAWL_API_KEY ?? null,
  jinaKey: process.env.JINA_API_KEY ?? process.env.JINA_KEY ?? null,
  scraperapiKey: process.env.SCRAPERAPI_KEY ?? null,
  zenrowsKey: process.env.ZENROWS_API_KEY ?? null,
  scrapingbeeKey: process.env.SCRAPINGBEE_API_KEY ?? null,
  geekflareKey: process.env.GEEKFLARE_API_KEY ?? null,
  hfToken: process.env.HF_TOKEN ?? null,
  cerebrasKey: process.env.CEREBRAS_API_KEY ?? null,
  openaiKey: process.env.OPENAI_API_KEY ?? null,
});

console.log(JSON.stringify(payload, null, 2));
