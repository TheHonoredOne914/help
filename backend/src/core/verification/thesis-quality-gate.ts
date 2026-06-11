import type { AgendaContract } from "../agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "../evidence/evidence-registry.js";
import { runQualityGate } from "../quality-gate/run-quality-gate.js";
import type { QualityGateInput, QualityGateReport } from "../quality-gate/types.js";

export type { QualityGateInput, QualityGateReport } from "../quality-gate/types.js";

export function runThesisQualityGate(
  finalText: string,
  contract: AgendaContract,
  registry: EvidenceRegistryCore,
  input: QualityGateInput,
): QualityGateReport {
  return runQualityGate({
    finalText,
    contract,
    registry,
    input: { ...input, evidenceRegistry: input.evidenceRegistry ?? registry },
  });
}
