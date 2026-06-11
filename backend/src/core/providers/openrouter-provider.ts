import type { ModelProvider, ProviderRequest, ProviderResponse } from "./provider-types.js";
import { safeProviderError } from "./provider-errors.js";

export class OpenRouterProvider implements ModelProvider {
  readonly name = "openrouter" as const;
  constructor(private readonly options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {}

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.options.apiKey) throw safeProviderError(this.name, new Error("OpenRouter provider unavailable: missing API key"));
    const fetchFn = this.options.fetchFn ?? fetch;
    const started = Date.now();
    const response = await fetchFn("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
      }),
      signal: request.signal,
    });
    if (!response.ok) throw safeProviderError(this.name, new Error(`OpenRouter provider failed: ${response.status} ${await response.text()}`));
    const data = await response.json() as any;
    return {
      provider: this.name,
      model: request.model,
      content: data.choices?.[0]?.message?.content ?? "",
      roleName: request.roleName,
      latencyMs: Date.now() - started,
      usage: normalizeUsage(data.usage),
      rawFinishReason: data.choices?.[0]?.finish_reason,
    };
  }
}

function normalizeUsage(usage: any): ProviderResponse["usage"] {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}
