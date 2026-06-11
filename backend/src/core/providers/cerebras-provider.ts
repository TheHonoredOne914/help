import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";
import { CEREBRAS_BASE_URL } from "../../lib/cerebras-client.js";

export class CerebrasProvider extends OpenAiCompatibleProvider {
  constructor(options: { apiKey?: string | null; baseUrl?: string; fetchFn?: typeof fetch } = {}) {
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? CEREBRAS_BASE_URL,
      providerName: "cerebras",
      missingKeyMessage: "Cerebras provider unavailable: missing API key",
      fetchFn: options.fetchFn,
    });
  }
}
