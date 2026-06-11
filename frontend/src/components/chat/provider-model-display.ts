export type ProviderModel = { id: string; ownedBy?: string; name?: string };

export const DEFAULT_GROQ_MODEL = "groq/llama-3.3-70b-versatile";
export const VALID_MODEL_PREFIXES = ["groq/", "nvidia/", "ollama/", "gemini/", "openrouter/", "github/", "cerebras/"];

export const stripPrefix = (id: string) => id.replace(/^(groq|nvidia|ollama|gemini|openrouter|github|cerebras)\//, "");

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
  name = name.replace(/llama-?3\.?1?-?(.*)/i, "Llama 3.1 $1");
  name = name.replace(/llama-?3\.?3?-?(.*)/i, "Llama 3.3 $1");
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

export const getModelIcon = (id: string) => {
  const lower = id.toLowerCase();
  if (lower.includes("claude")) return "CL";
  if (lower.includes("gpt")) return "OA";
  if (lower.includes("mistral")) return "MS";
  if (lower.includes("deepseek") || lower.includes("qwq") || lower.includes("qwen3")) return "DS";
  if (lower.includes("llama")) return "LM";
  if (lower.includes("mixtral")) return "MX";
  if (lower.includes("qwen") || lower.includes("gemma")) return "QW";
  if (lower.includes("gemini")) return "GM";
  return "AI";
};
