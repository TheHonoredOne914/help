import type { ProviderKeys } from "../provider-keys.js";

export interface ProviderSettingsDescriptor {
  id: string;
  displayName: string;
  category: "generation" | "search" | "extraction";
  apiKeyField: keyof ProviderKeys;
  headerName: string;
  description: string;
  docsUrl?: string;
  placeholder: string;
}

export const ALL_PROVIDER_DESCRIPTORS: ProviderSettingsDescriptor[] = [
  {
    id: "groq", displayName: "Groq", category: "generation",
    apiKeyField: "groqApiKey", headerName: "X-Groq-Api-Key",
    description: "Fast inference. Llama 3.3 70B, Qwen3 32B.",
    docsUrl: "https://console.groq.com", placeholder: "gsk_...",
  },
  {
    id: "nvidia", displayName: "NVIDIA", category: "generation",
    apiKeyField: "nvidiaApiKey", headerName: "X-Nvidia-Api-Key",
    description: "NVIDIA NIM. Kimi K2.6, Nemotron models.",
    docsUrl: "https://build.nvidia.com", placeholder: "nvapi-...",
  },
  {
    id: "gemini", displayName: "Gemini", category: "generation",
    apiKeyField: "geminiApiKey", headerName: "X-Gemini-Api-Key",
    description: "Google Gemini. Long-context synthesis.",
    docsUrl: "https://ai.google.dev", placeholder: "AIza...",
  },
  {
    id: "openrouter", displayName: "OpenRouter", category: "generation",
    apiKeyField: "openrouterApiKey", headerName: "X-OpenRouter-Api-Key",
    description: "100+ models via OpenRouter. Fallback provider.",
    docsUrl: "https://openrouter.ai", placeholder: "sk-or-...",
  },
  {
    id: "github", displayName: "GitHub Models", category: "generation",
    apiKeyField: "githubModelsApiKey", headerName: "X-GitHub-Models-Api-Key",
    description: "GitHub Models. GPT-4.1, Llama via GitHub.",
    docsUrl: "https://github.com/marketplace/models", placeholder: "github_pat_...",
  },
  {
    id: "openai", displayName: "OpenAI", category: "generation",
    apiKeyField: "openaiApiKey", headerName: "X-OpenAI-Api-Key",
    description: "GPT-4.1, GPT-4o. Synthesis and repair fallback.",
    docsUrl: "https://platform.openai.com", placeholder: "sk-...",
  },
  {
    id: "cerebras", displayName: "Cerebras", category: "generation",
    apiKeyField: "cerebrasApiKey", headerName: "X-Cerebras-Api-Key",
    description: "Ultra-fast inference via Wafer-Scale Engine.",
    docsUrl: "https://inference.cerebras.ai", placeholder: "csk-...",
  },
  {
    id: "ollama", displayName: "Ollama", category: "generation",
    apiKeyField: "ollamaApiKey", headerName: "X-Ollama-Api-Key",
    description: "Local models via Ollama.",
    docsUrl: "https://ollama.ai", placeholder: "",
  },
  {
    id: "tavily", displayName: "Tavily", category: "search",
    apiKeyField: "tavilyApiKey", headerName: "X-Tavily-Api-Key",
    description: "AI-optimized web search.",
    docsUrl: "https://tavily.com", placeholder: "tvly-...",
  },
  {
    id: "serper", displayName: "Serper", category: "search",
    apiKeyField: "serperApiKey", headerName: "X-Serper-Api-Key",
    description: "Google Search API.",
    docsUrl: "https://serper.dev", placeholder: "",
  },
  {
    id: "exa", displayName: "Exa", category: "search",
    apiKeyField: "exaApiKey", headerName: "X-Exa-Api-Key",
    description: "Neural search and content extraction.",
    docsUrl: "https://exa.ai", placeholder: "",
  },
  {
    id: "brave", displayName: "Brave", category: "search",
    apiKeyField: "braveApiKey", headerName: "X-Brave-Api-Key",
    description: "Brave Search API.",
    docsUrl: "https://brave.com/search/api", placeholder: "",
  },
  {
    id: "firecrawl", displayName: "Firecrawl", category: "extraction",
    apiKeyField: "firecrawlApiKey", headerName: "X-Firecrawl-Api-Key",
    description: "Web page scraping and markdown extraction.",
    docsUrl: "https://firecrawl.dev", placeholder: "",
  },
  {
    id: "jina", displayName: "Jina", category: "extraction",
    apiKeyField: "jinaApiKey", headerName: "X-Jina-Api-Key",
    description: "Jina Reader. URL to markdown extraction.",
    docsUrl: "https://jina.ai/reader", placeholder: "",
  },
];
