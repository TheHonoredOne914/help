import type { ModelProvider, ProviderRequest, ProviderResponse } from "./provider-types.js";
import { safeProviderError } from "./provider-errors.js";

export class GroqProvider implements ModelProvider {
  readonly name = "groq" as const;
  constructor(private readonly options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {}

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.options.apiKey) throw safeProviderError(this.name, new Error("Groq provider unavailable: missing API key"));
    const fetchFn = this.options.fetchFn ?? fetch;
    const started = Date.now();
    const response = await fetchFn("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
        stream: !!request.onStream,
      }),
      signal: request.signal,
    });
    if (!response.ok) throw safeProviderError(this.name, new Error(`Groq provider failed: ${response.status} ${await response.text()}`));
    
    if (request.onStream) {
      if (!response.body) throw new Error("No response body for streaming");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullContent = "";
      let buffer = "";
      let rawFinishReason: string | undefined;
      let lastUsage: any;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const chunk = data.choices?.[0]?.delta?.content ?? "";
              if (chunk) {
                fullContent += chunk;
                request.onStream(chunk);
              }
              if (data.choices?.[0]?.finish_reason) {
                rawFinishReason = data.choices[0].finish_reason;
              }
              // Groq sometimes returns usage as x_groq or usage in stream
              if (data.x_groq?.usage) lastUsage = data.x_groq.usage;
              else if (data.usage) lastUsage = data.usage;
            } catch (e) {}
          }
        }
      }
      return {
        provider: this.name,
        model: request.model,
        content: fullContent,
        roleName: request.roleName,
        latencyMs: Date.now() - started,
        usage: normalizeUsage(lastUsage),
        rawFinishReason,
      };
    }

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
