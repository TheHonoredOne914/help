import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

export const OPENCODE_ZEN_BASE_URL = process.env.OPENCODE_ZEN_BASE_URL ?? "https://opencode.ai/zen/v1";

export {
  OPENCODE_ZEN_FAST_MODEL,
  OPENCODE_ZEN_FREE_MODELS,
  OPENCODE_ZEN_STRONG_MODEL,
  filterOpenCodeZenFreeModels,
  isOpenCodeZenFreeModel,
  type OpenCodeZenFreeModel,
} from "./catalog/index.js";

export class OpenCodeZenProvider extends OpenAiCompatibleProvider {
  constructor(options: { apiKey?: string | null; baseUrl?: string; fetchFn?: typeof fetch } = {}) {
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? OPENCODE_ZEN_BASE_URL,
      providerName: "opencode",
      missingKeyMessage: "OpenCode Zen provider unavailable: missing API key",
      fetchFn: options.fetchFn,
    });
  }
}
