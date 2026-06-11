export const PROVIDER_KEY = "ai-research:provider-keys:v1";

export interface ProviderKeys {
  groqApiKey: string;
  nvidiaApiKey: string;
  ollamaApiKey: string;
  ollamaBaseUrl: string;
  openaiApiKey: string;
  geminiApiKey: string;
  tavilyApiKey: string;
  serperApiKey: string;
  exaApiKey: string;
  braveApiKey: string;
  firecrawlApiKey: string;
  jinaApiKey: string;
  openrouterApiKey: string;
  githubModelsApiKey: string;
  cerebrasApiKey: string;
  scraperapiApiKey: string;
  zenrowsApiKey: string;
  scrapingbeeApiKey: string;
  geekflareApiKey: string;
}

export const DEFAULT_PROVIDER_KEYS: ProviderKeys = {
  groqApiKey: "",
  nvidiaApiKey: "",
  ollamaApiKey: "",
  ollamaBaseUrl: "",
  openaiApiKey: "",
  geminiApiKey: "",
  tavilyApiKey: "",
  serperApiKey: "",
  exaApiKey: "",
  braveApiKey: "",
  firecrawlApiKey: "",
  jinaApiKey: "",
  openrouterApiKey: "",
  githubModelsApiKey: "",
  cerebrasApiKey: "",
  scraperapiApiKey: "",
  zenrowsApiKey: "",
  scrapingbeeApiKey: "",
  geekflareApiKey: "",
};

export function loadProviderKeys(): ProviderKeys {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY);
    if (!raw) return DEFAULT_PROVIDER_KEYS;
    return { ...DEFAULT_PROVIDER_KEYS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROVIDER_KEYS;
  }
}

export function saveProviderKeys(keys: ProviderKeys): void {
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(keys));
}

export function getProviderHeadersFromKeys(k: ProviderKeys): Record<string, string> {
  const h: Record<string, string> = {};
  if (k.groqApiKey.trim()) h["X-Groq-Api-Key"] = k.groqApiKey.trim();
  if (k.nvidiaApiKey.trim()) h["X-Nvidia-Api-Key"] = k.nvidiaApiKey.trim();
  if (k.ollamaApiKey.trim()) h["X-Ollama-Api-Key"] = k.ollamaApiKey.trim();
  if (k.ollamaBaseUrl.trim()) h["X-Ollama-Base-Url"] = k.ollamaBaseUrl.trim();
  if (k.openaiApiKey.trim()) h["X-OpenAI-Api-Key"] = k.openaiApiKey.trim();
  if (k.geminiApiKey.trim()) h["X-Gemini-Api-Key"] = k.geminiApiKey.trim();
  if (k.tavilyApiKey.trim()) h["X-Tavily-Api-Key"] = k.tavilyApiKey.trim();
  if (k.serperApiKey.trim()) h["X-Serper-Api-Key"] = k.serperApiKey.trim();
  if (k.exaApiKey.trim()) h["X-Exa-Api-Key"] = k.exaApiKey.trim();
  if (k.braveApiKey.trim()) h["X-Brave-Api-Key"] = k.braveApiKey.trim();
  if (k.firecrawlApiKey.trim()) h["X-Firecrawl-Api-Key"] = k.firecrawlApiKey.trim();
  if (k.jinaApiKey.trim()) h["X-Jina-Api-Key"] = k.jinaApiKey.trim();
  if (k.openrouterApiKey.trim()) h["X-OpenRouter-Api-Key"] = k.openrouterApiKey.trim();
  if (k.githubModelsApiKey.trim()) {
    h["X-GitHub-Models-Api-Key"] = k.githubModelsApiKey.trim();
    h["X-GitHub-Token"] = k.githubModelsApiKey.trim();
  }
  if (k.cerebrasApiKey.trim()) h["X-Cerebras-Api-Key"] = k.cerebrasApiKey.trim();
  if (k.scraperapiApiKey.trim()) h["X-ScraperAPI-Key"] = k.scraperapiApiKey.trim();
  if (k.zenrowsApiKey.trim()) h["X-ZenRows-Api-Key"] = k.zenrowsApiKey.trim();
  if (k.scrapingbeeApiKey.trim()) h["X-ScrapingBee-Api-Key"] = k.scrapingbeeApiKey.trim();
  if (k.geekflareApiKey.trim()) h["X-Geekflare-Api-Key"] = k.geekflareApiKey.trim();
  return h;
}

export function getProviderHeaders(): Record<string, string> {
  return getProviderHeadersFromKeys(loadProviderKeys());
}
