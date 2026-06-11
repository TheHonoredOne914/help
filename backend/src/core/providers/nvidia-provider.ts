import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

export const NVIDIA_NIM_BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

export class NvidiaProvider extends OpenAiCompatibleProvider {
  constructor(options: { apiKey?: string | null; baseUrl?: string; fetchFn?: typeof fetch } = {}) {
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? NVIDIA_NIM_BASE_URL,
      providerName: "nvidia",
      missingKeyMessage: "NVIDIA provider unavailable: missing API key",
      fetchFn: options.fetchFn,
    });
  }
}
