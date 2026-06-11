export function diagnoseStrategicFaultLine(answer: string): string {
  if (/election fraud happened|election was stolen|evms were manipulated/i.test(answer)) {
    return "Electoral overclaiming detected; downgrade to allegation/court/ECI framing.";
  }
  if (/UN Security Council|member states|UN resolution/i.test(answer)) {
    return "UN framing detected in Indian Mock Parliament mode.";
  }
  return "Indian parliamentary synthesis frame retained.";
}

export function buildStrategicSynthesisPrompt(): string {
  return [
    "Write D11 Strategic Insights for an Indian Mock Parliament research briefing.",
    "Use exactly these sections: Diagnosis, Prescription, Warning.",
    "Synthesize across D1-D10; do not summarize them in order.",
    "Tie strategy to Treasury Bench, Opposition, coalition pressure, POIs, amendments, and source anchors.",
    "Reject UN-style framing, bare citations, and unsupported allegation-as-proof language.",
  ].join("\n");
}
