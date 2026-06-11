import type { ChatMode, RhetoricsType } from "./chat-model-routing";

interface BuildChatRequestBodyInput {
  content: string;
  mode: ChatMode;
  normalModel: string;
  activeProviderModel: string;
  modelsForMode: string[];
  autoFallback?: boolean;
  userSystemPrompt?: string;
  rhetoricsOpts?: { rhetoricsType: RhetoricsType; creativity: number };
}

export function buildChatRequestBody({
  content,
  mode,
  normalModel,
  activeProviderModel,
  modelsForMode,
  autoFallback = false,
  userSystemPrompt,
  rhetoricsOpts,
}: BuildChatRequestBodyInput) {
  if (rhetoricsOpts) {
    return {
      content,
      mode: "rhetorics" as const,
      rhetoricsType: rhetoricsOpts.rhetoricsType,
      creativity: rhetoricsOpts.creativity,
    };
  }

  return {
    content,
    mode,
    researchMode: mode === "normal" ? undefined : mode,
    modelConfig: "standard" as const,
    normalModel: mode === "normal" ? normalModel : activeProviderModel,
    webModels: mode === "normal" ? undefined : modelsForMode,
    autoFallback,
    systemPrompt: userSystemPrompt || undefined,
  };
}

