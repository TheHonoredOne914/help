export interface EvidencePackTelemetry {
  warnings: string[];
}

export function createEvidencePackTelemetry(): EvidencePackTelemetry {
  return { warnings: [] };
}
