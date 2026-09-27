export interface ResearchPersona {
  label: string;
  emoji: string;
  color: string;
}

export const RESEARCH_PERSONAS: readonly ResearchPersona[] = [
  { label: "Data Analyst", emoji: "DA", color: "bg-[var(--navy)]/10 text-[var(--slate)] border-[var(--navy)]/40" },
  { label: "Legal Researcher", emoji: "LR", color: "bg-[var(--brass)]/10 text-[var(--slate)] border-[var(--brass)]/40" },
  { label: "Policy Analyst", emoji: "PA", color: "bg-slate-500/10 text-[var(--slate)] border-slate-300/40" },
  { label: "Current Affairs", emoji: "CA", color: "bg-slate-500/10 text-[var(--slate)] border-slate-300/40" },
] as const;

export function getResearchPersona(index: number): ResearchPersona {
  return RESEARCH_PERSONAS[index % RESEARCH_PERSONAS.length];
}

/** Label-only list for persisted pipeline discussion headers. */
export const RESEARCH_PERSONA_LABELS = RESEARCH_PERSONAS.map((p) => p.label);
