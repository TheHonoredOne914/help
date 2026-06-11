export type ResearchMode = "fast_research" | "deep_research" | "council";
export type ChatMode = "normal" | ResearchMode;
export type ChatType = "research" | "rhetorics";
export type RhetoricsType = "kavita" | "speech" | "debate";
export type NormalModel = string;

export function getModelsForMode(
  mode: ChatMode | "web_search",
  normalModel: string,
  webSearchModels: string[],
  deepResearchModels: string[]
): string[] {
  if (mode === "normal") return [normalModel];
  if (mode === "fast_research" || mode === "web_search") return webSearchModels;
  return deepResearchModels;
}

export function getPrimaryModelForMode(
  mode: ChatMode | "web_search",
  normalModel: string,
  webSearchModels: string[],
  deepResearchModels: string[]
): string {
  return getModelsForMode(mode, normalModel, webSearchModels, deepResearchModels)[0] ?? normalModel;
}
