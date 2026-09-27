export type ProviderModel = { id: string; ownedBy?: string; name?: string };

export const DEFAULT_GROQ_MODEL = "groq/openai/gpt-oss-120b";
export const VALID_MODEL_PREFIXES = ["groq/", "nvidia/", "ollama/", "gemini/", "openrouter/", "github/", "cerebras/", "opencode/"];

const UNSUPPORTED_CHAT_MODELS =
  /(?:^|\/)llama-3\.3-70b-versatile$|kimi-k2\.6|nemotron-3-ultra-550b-a55b|nemotron-ultra-253b|claude-3\.5-sonnet|claude-3-5-sonnet|gemini-1\.5-pro|gemini-1\.5-flash/i;
const NON_CHAT_LISTED_MODELS =
  /whisper|tts|transcribe|orpheus|playai|:batch\b|prompt-guard|llama-guard|nemoguard|safety[-_ ]?guard|moderation|embed(?:ding)?s?|rerank|content-safety|safeguard|vision|image|audio|diffusion|deplot|fuyu|nano[- ]?banana/i;

export function isOpenRouterFreeModel(id: string): boolean {
  return /:free$/i.test(id.trim());
}

/** Dead, stale, or non-chat IDs that must never appear in the model selector. */
export function isKnownUnavailableChatModel(model: string): boolean {
  const id = model.trim();
  return UNSUPPORTED_CHAT_MODELS.test(id) || NON_CHAT_LISTED_MODELS.test(id);
}

export type ModelBrandKey =
  | "openai"
  | "anthropic"
  | "gemini"
  | "meta"
  | "mistral"
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "nvidia"
  | "groq"
  | "cerebras"
  | "microsoft"
  | "ollama"
  | "github"
  | "openrouter"
  | "opencode"
  | "generic";

export function getModelBrandKey(id: string): ModelBrandKey {
  const lower = id.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gemini") || lower.includes("gemma")) return "gemini";
  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("gpt-oss")) return "openai";
  if (lower.includes("nemotron")) return "nvidia";
  if (lower.includes("llama") || lower.includes("meta")) return "meta";
  if (lower.includes("mistral") || lower.includes("mixtral")) return "mistral";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("qwen") || lower.includes("qwq")) return "qwen";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "moonshot";
  if (lower.includes("nvidia")) return "nvidia";
  if (lower.includes("cerebras")) return "cerebras";
  if (lower.includes("phi") || lower.includes("microsoft")) return "microsoft";
  if (lower.includes("ollama")) return "ollama";
  if (lower.includes("github")) return "github";
  if (lower.includes("openrouter")) return "openrouter";
  if (lower.includes("opencode") || lower.includes("big-pickle")) return "opencode";
  if (lower.includes("groq")) return "groq";
  return "generic";
}

export function getProviderBrandKey(provider: string): ModelBrandKey {
  switch (provider.trim().toLowerCase()) {
    case "groq": return "groq";
    case "gemini": return "gemini";
    case "nvidia": return "nvidia";
    case "openrouter": return "openrouter";
    case "github": return "github";
    case "ollama": return "ollama";
    case "cerebras": return "cerebras";
    case "opencode": return "opencode";
    default: return "generic";
  }
}

/** Prefer the model family logo; fall back to the provider mark instead of a letter badge. */
export function resolveModelBrandKey(id?: string, provider?: string): ModelBrandKey {
  const fromId = id ? getModelBrandKey(id) : "generic";
  return fromId === "generic" ? getProviderBrandKey(provider ?? "") : fromId;
}

export const stripPrefix = (id: string) => id.replace(/^(groq|nvidia|ollama|gemini|openrouter|github|cerebras|opencode)\//, "");

export const simplifyModelName = (id: string) => {
  let name = id.split("/").pop() ?? id;
  name = name.replace(/-(instruct|preview|versatile|latest|chat|text)$/i, "");
  if (name.includes("deepseek-r1-distill-llama")) {
    return name.replace(/deepseek-r1-distill-llama-?(.*)/i, "DeepSeek R1 (Llama $1)").trim();
  }
  if (name.includes("deepseek-r1-distill-qwen")) {
    return name.replace(/deepseek-r1-distill-qwen-?(.*)/i, "DeepSeek R1 (Qwen $1)").trim();
  }
  if (name.startsWith("claude")) return name.replace(/claude-?/i, "Claude ").replace(/-/g, " ").trim();
  if (name.startsWith("gpt-")) return name.toUpperCase().replace(/-/g, " ").trim();
  if (name.startsWith("mistral")) return name.replace(/mistral-?/i, "Mistral ").replace(/-/g, " ").trim();
  name = name.replace(/llama-?3\.3-?(.*)/i, "Llama 3.3 $1");
  name = name.replace(/llama-?3\.1-?(.*)/i, "Llama 3.1 $1");
  name = name.replace(/^gemini-2\.5-flash-lite$/i, "Gemini 2.5 Flash Lite");
  name = name.replace(/^gemini-2\.5-flash$/i, "Gemini 2.5 Flash");
  name = name.replace(/^gemini-2\.5-pro$/i, "Gemini 2.5 Pro");
  name = name.replace(/^gemini-2\.0-flash-thinking-exp$/i, "Gemini 2.0 Flash Thinking");
  name = name.replace(/^gemini-2\.0-flash$/i, "Gemini 2.0 Flash");
  name = name.replace(/^gemini-1\.5-pro$/i, "Gemini 1.5 Pro");
  name = name.replace(/^gemini-1\.5-flash$/i, "Gemini 1.5 Flash");
  name = name.replace(/^gemini-(\d+\.\d+)-(.+)$/i, "Gemini $1 $2");
  name = name.replace(/qwen-?2\.?5?-?(.*)/i, "Qwen 2.5 $1");
  name = name.replace(/gemma-?2-?(.*)/i, "Gemma 2 $1");
  name = name.replace(/mixtral-?8x7b-?32768/i, "Mixtral 8x7B");
  name = name.replace(/-?it$/i, "");
  name = name.replace(/-/g, " ");
  name = name.replace(/([0-9]+)([a-z]+)/gi, (_match, p1, p2) => `${p1}${p2.toUpperCase()}`);
  return name.trim() || id;
};

export const getModelDescription = (id: string) => {
  const lower = id.toLowerCase();
  if (lower.includes("claude-sonnet") || lower.includes("claude-3.5-sonnet") || lower.includes("claude-3-5-sonnet")) return "Best overall: reasoning, writing & analysis";
  if (lower.includes("claude") && lower.includes("haiku")) return "Fast & cheap: great for quick MUN lookups";
  if (lower.includes("claude") && lower.includes("opus")) return "Most capable Claude: deep diplomatic analysis";
  if (lower.includes("gpt-4o-mini")) return "Fast & affordable GPT-4 class model";
  if (lower.includes("gpt-4o")) return "OpenAI flagship: strong all-round performance";
  if (lower.includes("mistral-large")) return "Mistral flagship: strong European perspective";
  if (lower.includes("mistral-nemo") || lower.includes("mistral-small")) return "Fast Mistral: good for drafting & summaries";
  if (lower.includes("deepseek") || lower.includes("qwq") || lower.includes("qwen3")) return "Best for deep reasoning & math";
  if (lower.includes("70b") || lower.includes("90b")) return "Best for complex synthesis & high accuracy";
  if (lower.includes("8b") || lower.includes("3b") || lower.includes("7b")) return "Best for fast, simple tasks";
  if (lower.includes("mixtral")) return "Best for parallel processing & speed";
  if (lower.includes("qwen")) return "Best for coding & multilingual tasks";
  if (lower.includes("gemma")) return "Best for precise text generation";
  if (lower.includes("gemini-3.1-pro")) return "SOTA: Best for complex diplomatic synthesis";
  if (lower.includes("gemini-3.1-flash-lite")) return "Ultra-fast: Best for simple MUN queries";
  if (lower.includes("gemini")) return "Versatile Google model with large context";
  return "General purpose model";
};

