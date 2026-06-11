import type { RequestKeys } from "../../lib/types.js";

export interface ProviderKeyRequest {
  headers: Record<string, string | string[] | undefined>;
}

export type ProviderKeyEnv = Partial<Record<
  | "GROQ_API_KEY"
  | "OLLAMA_API_KEY"
  | "OLLAMA_BASE_URL"
  | "NVIDIA_API_KEY"
  | "GEMINI_API_KEY"
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_KEY"
  | "GITHUB_MODELS_API_KEY"
  | "GITHUB_TOKEN"
  | "TAVILY_API_KEY"
  | "SERPER_API_KEY"
  | "SERPER_KEY"
  | "EXA_API_KEY"
  | "BRAVE_API_KEY"
  | "BRAVE_KEY"
  | "FIRECRAWL_API_KEY"
  | "JINA_API_KEY"
  | "JINA_KEY"
  | "SCRAPERAPI_KEY"
  | "ZENROWS_API_KEY"
  | "SCRAPINGBEE_API_KEY"
  | "GEEKFLARE_API_KEY"
  | "HF_TOKEN"
  | "CEREBRAS_API_KEY"
  | "OPENAI_API_KEY",
  string | undefined
>>;

const PLACEHOLDER_VALUE_RE = /^(your|insert|replace|todo|changeme|example|dummy|none|null|undefined)(?:[_-]|$)/i;

function cleanProviderValue(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return null;
  if (PLACEHOLDER_VALUE_RE.test(trimmed)) return null;
  if (trimmed.startsWith("ssk-")) return trimmed.slice(1);
  return trimmed;
}

export function extractProviderKeys(req: ProviderKeyRequest, env: ProviderKeyEnv = process.env): RequestKeys {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(req.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const h = (name: string): string | null => {
    const value = normalizedHeaders[name.toLowerCase()];
    if (!value) return null;
    const values = Array.isArray(value) ? value : [value];
    for (const rawValue of values) {
      const cleaned = rawValue
        .split(",")
        .map(v => cleanProviderValue(v))
        .filter((v): v is string => Boolean(v));
      if (cleaned.length > 0) return Array.from(new Set(cleaned)).join(",");
    }
    return null;
  };

  const getEnvKey = (baseName: string): string | null => {
    const keys: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const val = (env as Record<string, string | undefined>)[`${baseName}_${i}`];
      keys.push(...(val ?? "").split(",").map(k => cleanProviderValue(k)).filter((k): k is string => Boolean(k)));
    }

    const baseVal = (env as Record<string, string | undefined>)[baseName];
    keys.push(...(baseVal ?? "").split(",").map(k => cleanProviderValue(k)).filter((k): k is string => Boolean(k)));

    const uniqueKeys = Array.from(new Set(keys));
    return uniqueKeys.length > 0 ? uniqueKeys.join(",") : null;
  };

  return {
    groqKey: h("x-groq-api-key") ?? getEnvKey("GROQ_API_KEY") ?? null,
    ollamaKey: h("x-ollama-api-key") ?? getEnvKey("OLLAMA_API_KEY") ?? null,
    ollamaBase: h("x-ollama-base-url") ?? getEnvKey("OLLAMA_BASE_URL") ?? null,
    nvidiaKey: h("x-nvidia-api-key") ?? getEnvKey("NVIDIA_API_KEY") ?? null,
    geminiKey: h("x-gemini-api-key") ?? getEnvKey("GEMINI_API_KEY") ?? null,
    openrouterKey: h("x-openrouter-api-key") ?? getEnvKey("OPENROUTER_API_KEY") ?? getEnvKey("OPENROUTER_KEY") ?? null,
    githubToken: h("x-github-models-api-key") ?? h("x-github-token") ?? getEnvKey("GITHUB_MODELS_API_KEY") ?? getEnvKey("GITHUB_TOKEN") ?? null,
    tavilyKey: h("x-tavily-api-key") ?? getEnvKey("TAVILY_API_KEY") ?? null,
    serperKey: h("x-serper-api-key") ?? getEnvKey("SERPER_API_KEY") ?? getEnvKey("SERPER_KEY") ?? null,
    exaKey: h("x-exa-api-key") ?? getEnvKey("EXA_API_KEY") ?? null,
    braveKey: h("x-brave-api-key") ?? getEnvKey("BRAVE_API_KEY") ?? getEnvKey("BRAVE_KEY") ?? null,
    firecrawlKey: h("x-firecrawl-api-key") ?? getEnvKey("FIRECRAWL_API_KEY") ?? null,
    jinaKey: h("x-jina-api-key") ?? getEnvKey("JINA_API_KEY") ?? getEnvKey("JINA_KEY") ?? null,
    scraperapiKey: h("x-scraperapi-api-key") ?? h("x-scraper-api-key") ?? getEnvKey("SCRAPERAPI_KEY") ?? null,
    zenrowsKey: h("x-zenrows-api-key") ?? getEnvKey("ZENROWS_API_KEY") ?? null,
    scrapingbeeKey: h("x-scrapingbee-api-key") ?? getEnvKey("SCRAPINGBEE_API_KEY") ?? null,
    geekflareKey: h("x-geekflare-api-key") ?? getEnvKey("GEEKFLARE_API_KEY") ?? null,
    hfToken: h("x-hf-token") ?? getEnvKey("HF_TOKEN") ?? null,
    cerebrasKey: h("x-cerebras-api-key") ?? getEnvKey("CEREBRAS_API_KEY") ?? null,
    openaiKey: h("x-openai-api-key") ?? getEnvKey("OPENAI_API_KEY") ?? null,
  };
}
