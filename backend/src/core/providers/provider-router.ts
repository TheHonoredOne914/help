import type { ModelProvider, ProviderJsonResponse, ProviderName, ProviderRequest, ProviderResponse } from "./provider-types.js";
import { classifyProviderError, safeProviderError } from "./provider-errors.js";
import { logProviderCall } from "./provider-call-logger.js";

export class ProviderRouter {
  private readonly providers = new Map<ProviderName, ModelProvider>();

  register(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);
  }

  hasProvider(providerName: ProviderName): boolean {
    return this.providers.has(providerName);
  }

  getRegisteredProviderNames(): ProviderName[] {
    return [...this.providers.keys()];
  }

  async complete(providerName: ProviderName, request: ProviderRequest): Promise<ProviderResponse> {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Provider not configured: ${providerName}`);
    const started = Date.now();
    const timeoutMs = request.timeoutMs ?? 45_000;
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (request.signal?.aborted) controller.abort();
    request.signal?.addEventListener("abort", abortFromParent, { once: true });
    try {
      const response = await withTimeout(
        provider.complete({ ...request, signal: controller.signal }),
        timeoutMs,
        providerName,
        () => controller.abort(),
      );
      logProviderCall({
        event: request.roleName?.includes("source_usage") ? "source_usage_provider_call" : "generation_provider_call",
        providerName,
        providerKind: "generation",
        operation: request.roleName ?? "chat_completion",
        statusCode: 200,
        latencyMs: response.latencyMs ?? Date.now() - started,
        runId: typeof request.metadata?.runId === "string" ? request.metadata.runId : null,
        model: request.model,
        success: true,
      });
      return { ...response, latencyMs: response.latencyMs ?? Date.now() - started, roleName: response.roleName ?? request.roleName };
    } catch (error) {
      const report = classifyProviderError(providerName, error);
      logProviderCall({
        event: request.roleName?.includes("source_usage") ? "source_usage_provider_call" : "generation_provider_call",
        providerName,
        providerKind: "generation",
        operation: request.roleName ?? "chat_completion",
        statusCode: report.status ?? null,
        latencyMs: Date.now() - started,
        runId: typeof request.metadata?.runId === "string" ? request.metadata.runId : null,
        model: request.model,
        errorCode: report.code,
        retryAfterMs: report.retryAfterMs ?? null,
        success: false,
      });
      throw safeProviderError(providerName, error);
    } finally {
      request.signal?.removeEventListener("abort", abortFromParent);
    }
  }

  async completeJson(providerName: ProviderName, request: ProviderRequest): Promise<ProviderJsonResponse> {
    const retries = request.retries ?? 1;
    let lastResponse: ProviderResponse | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.complete(providerName, {
          ...request,
          metadata: { ...(request.metadata ?? {}), responseFormat: "json", attempt },
        });
        lastResponse = response;
        return { ...response, json: JSON.parse(extractJson(response.content)) };
      } catch (error) {
        lastError = error;
      }
    }
    throw safeProviderError(providerName, lastError ?? new Error(`Provider JSON task failed${lastResponse ? `: ${lastResponse.content.slice(0, 120)}` : ""}`));
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, provider: string, onTimeout?: () => void): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new Error(`${provider} provider timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) return trimmed.slice(objectStart, objectEnd + 1);
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return trimmed.slice(arrayStart, arrayEnd + 1);
  return trimmed;
}
