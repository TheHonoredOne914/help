export interface CoreFinalAnswerDecisionInput {
  isDeep: boolean;
  usedCoreGeneration?: boolean;
  usedLegacyFallback?: boolean;
  useCoreGenerationEnv?: string;
  emergencyCompatibilityEnv?: string;
}

export function shouldUseCoreFinalAnswer(input: CoreFinalAnswerDecisionInput): boolean {
  return Boolean(
    input.isDeep
    && input.usedCoreGeneration
    && !input.usedLegacyFallback
    && input.useCoreGenerationEnv !== "false"
    && input.emergencyCompatibilityEnv !== "true",
  );
}
