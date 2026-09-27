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
  regenerate?: boolean;
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
  regenerate = false,
}: BuildChatRequestBodyInput) {
  const regenerateField = regenerate ? { regenerate: true as const } : {};
  if (rhetoricsOpts) {
    return {
      content,
      mode: "rhetorics" as const,
      rhetoricsType: rhetoricsOpts.rhetoricsType,
      creativity: rhetoricsOpts.creativity,
      normalModel: activeProviderModel || normalModel,
      autoFallback,
      systemPrompt: userSystemPrompt || undefined,
      ...regenerateField,
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
    ...regenerateField,
  };
}

