import type { EvidenceCard } from "../core/evidence/evidence-pack-builder.js";

export type SmallModelTaskType =
  | "source_classification"
  | "evidence_extraction"
  | "evidence_compression"
  | "claim_labeling"
  | "citation_pattern_check"
  | "poi_generation"
  | "rebuttal_draft"
  | "source_limitation_extraction";

export const SMALL_MODEL_FORBIDDEN_TASKS = [
  "final_thesis_synthesis",
  "final_legal_interpretation",
  "final_electoral_integrity_judgment",
  "final_hallucination_audit",
  "final_quality_gate",
] as const;

export interface SmallModelTask {
  taskId: string;
  taskType: SmallModelTaskType;
  evidenceCards: EvidenceCard[];
  requiredSourceIds: number[];
  outputSchema: unknown;
  maxRetries: number;
}

export interface SmallModelTaskResult {
  taskId: string;
  modelName: string;
  sourceIdsProcessed: number[];
  sourceCountProcessed: number;
  output: unknown;
  validJson: boolean;
  confidence: "high" | "medium" | "low";
  needsEscalation: boolean;
  errors: string[];
}

export type SmallModelInvoker = (payload: { task: SmallModelTask; evidenceCards: EvidenceCard[]; attempt: number }) => Promise<string>;

export async function runSmallModelTask(task: SmallModelTask, invoke: SmallModelInvoker, modelName = "small-structured-worker"): Promise<SmallModelTaskResult> {
  const cards = task.evidenceCards.filter((card) => task.requiredSourceIds.includes(card.sourceId)).slice(0, 10);
  const errors: string[] = [];
  let output: unknown = null;
  for (let attempt = 0; attempt <= task.maxRetries; attempt += 1) {
    try {
      const raw = await invoke({ task, evidenceCards: cards, attempt });
      output = JSON.parse(raw);
      return {
        taskId: task.taskId,
        modelName,
        sourceIdsProcessed: cards.map((card) => card.sourceId),
        sourceCountProcessed: cards.length,
        output,
        validJson: true,
        confidence: cards.length >= task.requiredSourceIds.length ? "high" : "medium",
        needsEscalation: false,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    taskId: task.taskId,
    modelName,
    sourceIdsProcessed: cards.map((card) => card.sourceId),
    sourceCountProcessed: cards.length,
    output,
    validJson: false,
    confidence: "low",
    needsEscalation: true,
    errors,
  };
}
