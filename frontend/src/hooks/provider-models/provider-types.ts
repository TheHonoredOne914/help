export type ProviderName =
  | "groq"
  | "openrouter"
  | "nvidia"
  | "github"
  | "gemini"
  | "ollama"
  | "tavily"
  | "exa"
  | "jina"
  | "firecrawl"
  | "brave"
  | "serper"
  | "cerebras";

export type ProviderRuntimeStatusValue =
  | "missing_key"
  | "checking"
  | "healthy"
  | "invalid_key"
  | "billing_credits"
  | "rate_limited"
  | "network_error"
  | "timeout"
  | "catalog_fallback"
  | "unverified"
  | "unavailable"
  | "status_unknown";

export interface ProviderRuntimeStatus {
  provider: ProviderName;
  configured: boolean;
  healthy: boolean;
  checking: boolean;
  status: ProviderRuntimeStatusValue;
  modelCount: number;
  latencyMs?: number;
  error?: string;
  source?: "live" | "catalog_fallback";
  configuredFrom?: "browser" | "server_env" | "none";
  canChat?: boolean;
  chatVerified?: boolean;
  canListModels?: boolean;
  liveModelListVerified?: boolean;
  catalogFallbackOnly?: boolean;
  canSearch?: boolean;
  canExtract?: boolean;
  availableForDisplay?: boolean;
  availableForResearch?: boolean;
}

export interface ProviderModel {
  id: string;
  name?: string;
  ownedBy?: string;
  badge?: string;
  contextWindow?: number;
}

export type ModelProviderName = "groq" | "openrouter" | "nvidia" | "github" | "gemini" | "ollama" | "cerebras";
export type ProviderModels = Record<ModelProviderName, ProviderModel[]>;
export type ProviderStatusMap = Record<ProviderName, ProviderRuntimeStatus>;
export type ProviderStatusPatch = Partial<ProviderStatusMap>;
export type ProviderModelPatch = Partial<Record<ModelProviderName, ProviderModel[]>>;

export const MODEL_PROVIDERS: ModelProviderName[] = ["groq", "gemini", "nvidia", "openrouter", "github", "ollama", "cerebras"];
export const STATUS_PROVIDERS: ProviderName[] = [...MODEL_PROVIDERS, "serper", "exa", "tavily", "brave", "firecrawl", "jina"];
