import type { ProviderName, ProviderRequest, ProviderResponse } from "../../src/core/providers/provider-types.js";
import { ProviderError } from "../../src/core/providers/provider-errors.js";

export type FakeProviderResponse =
  | { type: "success"; content: string }
  | { type: "json"; json: unknown }
  | { type: "invalid_json"; content?: string }
  | { type: "413"; message?: string }
  | { type: "429"; retryAfterMs?: number; message?: string }
  | { type: "401"; message?: string }
  | { type: "network_error"; message?: string };

export class FakeProviderRouter {
  calls: Array<{ provider: ProviderName; request: ProviderRequest; estimatedTokens: number }> = [];
  private readonly scripts = new Map<ProviderName, FakeProviderResponse[]>();

  script(provider: ProviderName, responses: FakeProviderResponse[]): this {
    this.scripts.set(provider, [...responses]);
    return this;
  }

  hasProvider(provider: ProviderName): boolean {
    return this.scripts.has(provider);
  }

  async complete(provider: ProviderName, request: ProviderRequest): Promise<ProviderResponse> {
    this.calls.push({ provider, request, estimatedTokens: Math.ceil(request.messages.map((message) => message.content).join("\n").length / 4) });
    const next = this.scripts.get(provider)?.shift() ?? { type: "success", content: "ok" };
    if (next.type === "success") return { provider, model: request.model, content: next.content };
    if (next.type === "json") return { provider, model: request.model, content: JSON.stringify(next.json) };
    if (next.type === "invalid_json") return { provider, model: request.model, content: next.content ?? "not json" };
    if (next.type === "413") throw new ProviderError(next.message ?? "Request too large for model. Limit 12000 TPM, requested 32468.", provider, { status: 413 });
    if (next.type === "429") throw new ProviderError(next.message ?? "Rate limit reached. Retry after 17s. org_123 billing https://console.groq.com/settings/billing", provider, { status: 429, retryAfterMs: next.retryAfterMs });
    if (next.type === "401") throw new ProviderError(next.message ?? "Invalid API key sk-secret", provider, { status: 401 });
    throw new ProviderError(next.message ?? "Network error", provider, { status: 503 });
  }

  async completeJson(provider: ProviderName, request: ProviderRequest): Promise<ProviderResponse & { json: unknown }> {
    const response = await this.complete(provider, request);
    return { ...response, json: JSON.parse(response.content) };
  }
}
