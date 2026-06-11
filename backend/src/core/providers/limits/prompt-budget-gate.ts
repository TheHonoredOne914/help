import type { PromptBudget } from "../../generation/prompt-budget.js";
import type { ProviderName } from "../provider-types.js";
import type { ProviderBudgetCheck } from "./provider-limit-types.js";
import { getLimitProfile } from "./provider-limit-registry.js";

export function checkPromptBudget(
  providerName: ProviderName,
  model: string,
  estimatedInputTokens: number,
  promptBudget: PromptBudget,
): ProviderBudgetCheck {
  const limits = getLimitProfile(providerName, model);
  const safeBudget = Math.min(limits.safeInputBudget, promptBudget.maxInputTokens);
  const wouldExceed = estimatedInputTokens > safeBudget;

  let recommendation: ProviderBudgetCheck["recommendation"];
  if (!wouldExceed) {
    recommendation = "proceed";
  } else if (estimatedInputTokens <= limits.providerMaxInputTokens) {
    recommendation = "compress";
  } else {
    recommendation = "skip";
  }

  return {
    providerName,
    model,
    estimatedInputTokens,
    safeInputBudget: safeBudget,
    providerMaxInputTokens: limits.providerMaxInputTokens,
    wouldExceed,
    recommendation,
  };
}
