import type { ModelProvider, ProviderRequest, ProviderResponse } from "./provider-types.js";
import { safeProviderError } from "./provider-errors.js";

export class GeminiProvider implements ModelProvider {
  readonly name = "gemini" as const;
  constructor(private readonly options: { apiKey?: string; fetchFn?: typeof fetch } = {}) {}

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.options.apiKey) throw safeProviderError(this.name, new Error("Gemini provider unavailable: missing API key"));
    const fetchFn = this.options.fetchFn ?? fetch;
    const started = Date.now();
    const baseUrl = request.onStream
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.options.apiKey)}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(this.options.apiKey)}`;
    const response = await fetchFn(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: request.messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
        systemInstruction: request.messages.find((message) => message.role === "system") ? { parts: [{ text: request.messages.find((message) => message.role === "system")?.content }] } : undefined,
        generationConfig: { temperature: request.temperature ?? 0.2, maxOutputTokens: request.maxTokens },
      }),
      signal: request.signal,
    });
    if (!response.ok) throw safeProviderError(this.name, new Error(`Gemini provider failed: ${response.status} ${await response.text()}`));
    
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
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const chunk = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
              if (chunk) {
                fullContent += chunk;
                request.onStream(chunk);
              }
              if (data.candidates?.[0]?.finishReason) {
                rawFinishReason = data.candidates[0].finishReason;
              }
              if (data.usageMetadata) lastUsage = data.usageMetadata;
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
        usage: {
          promptTokens: lastUsage?.promptTokenCount,
          completionTokens: lastUsage?.candidatesTokenCount,
          totalTokens: lastUsage?.totalTokenCount,
        },
        rawFinishReason,
      };
    }

    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ?? "";
    return {
      provider: this.name,
      model: request.model,
      content,
      roleName: request.roleName,
      latencyMs: Date.now() - started,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
      rawFinishReason: data.candidates?.[0]?.finishReason,
    };
  }
}
