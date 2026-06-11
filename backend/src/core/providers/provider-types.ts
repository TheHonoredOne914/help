export type ProviderName = "groq" | "openrouter" | "gemini" | "nvidia" | "github" | "cerebras" | "openai";

export interface ProviderRequest {
  model: string;
  roleName?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
  onStream?: (chunk: string) => void;
}

export interface ProviderResponse {
  provider: ProviderName;
  model: string;
  content: string;
  roleName?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latencyMs?: number;
  rawFinishReason?: string;
}

export interface ProviderJsonResponse extends ProviderResponse {
  json: unknown;
}

export interface ModelProvider {
  name: ProviderName;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}
