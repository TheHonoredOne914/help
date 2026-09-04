export function ensureResearchWorkerModels(
  mode: string,
  models: string[],
  fallbackModel = "groq/llama-3.3-70b-versatile",
): string[] {
  if (mode !== "web_search" && mode !== "deep_research") return models;
  if (models.length >= 2) return models;

  const planner = models[0] ?? fallbackModel;
  const fallbackWorker = planner !== fallbackModel
    ? fallbackModel
    : "groq/llama-3.1-8b-instant";

  return [planner, fallbackWorker];
}
