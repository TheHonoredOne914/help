import { getGeminiClient } from "../lib/gemini-client.js";
import { getGroqClient } from "../lib/groq-client.js";
import { logger } from "../lib/logger.js";
import { getOpenRouterClient } from "../lib/openrouter-client.js";
import { getCerebrasClient, isCerebrasEnabled } from "../lib/cerebras-client.js";
import type { SearchResult } from "../lib/types.js";
import { assertLegacySynthesisAllowed } from "../core/synthesis/synthesis-engine/legacy-synthesis-guard.js";

export interface SynthesisOptions {
  streaming?: boolean;
  groqKey?: string | null;
  geminiKey?: string | null;
  openrouterKey?: string | null;
  sources?: SearchResult[];
  agendaContext?: { agendaText: string; topicType?: string };
}

const BESTDEL_BASE_SYNTHESIS_SYSTEM = `You are BestDel, an expert parliamentary intelligence engine for Indian MUN delegates.

CITATION RULES (non-negotiable):
- Every factual claim, statistic, or legal reference MUST cite [Source N](url)
- If a fact is not in the provided sources, DO NOT include it
- Never invent Article numbers, case names, statistics, or institutional names
- If sources are insufficient, explicitly state: "Source gap: [topic] not available in retrieved evidence"

PARLIAMENTARY REGISTER:
- Write as a senior Indian parliamentary researcher
- Never use: "In the context of...", "Many experts believe...", "It can be argued..."
- Use specific institution names, provision numbers, year ranges
- Be direct, analytical, citation-anchored`;

function buildSynthesisSystemPrompt(agendaText: string, topicType?: string): string {
  return `${BESTDEL_BASE_SYNTHESIS_SYSTEM}

AGENDA CONTEXT: ${agendaText.slice(0, 200)}
${topicType ? `TOPIC TYPE: ${topicType}` : ""}

Generate analysis that directly addresses this specific agenda with India-specific evidence.`;
}

// Standalone streaming helper; the active division pipeline streams through
// division-engine.ts callModel via the onDivisionChunk callback.
export async function* streamSynthesis(
  prompt: string,
  client: any,
  modelId: string,
  maxTokens: number
): AsyncGenerator<string> {
  // B18-03: Block legacy synthesis in production
  assertLegacySynthesisAllowed();
  const stream = await client.chat.completions.create({
    model: modelId,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) yield delta;
  }
}

export async function synthesizeWithFallback(
  prompt: string,
  opts: { groqKey?: string | null; geminiKey?: string | null; openrouterKey?: string | null; cerebrasKey?: string | null; agendaContext?: { agendaText: string; topicType?: string } }
): Promise<{ text: string; model: string }> {
  // B18-03: Block legacy synthesis in production
  assertLegacySynthesisAllowed();
  const models = [
    opts.groqKey ? { client: getGroqClient(opts.groqKey), id: "llama-3.3-70b-versatile", label: "groq" } : null,
    isCerebrasEnabled(opts.cerebrasKey) ? { client: getCerebrasClient(opts.cerebrasKey), id: "llama3.3-70b", label: "cerebras" } : null,
    opts.geminiKey ? { client: getGeminiClient(opts.geminiKey), id: "gemini-2.5-flash", label: "gemini" } : null,
    opts.openrouterKey ? { client: getOpenRouterClient(opts.openrouterKey), id: "deepseek/deepseek-chat", label: "deepseek" } : null,
  ].filter((m): m is { client: any; id: string; label: string } => Boolean(m));

  for (const m of models) {
    try {
      const text = await withTimeout(() => callModelNonStreaming(m.client, m.id, prompt, 6000, opts.agendaContext), 90_000);
      if (text.trim().length > 300) return { text, model: m.label };
    } catch (err) {
      logger.warn({ err, model: m.label }, "[synthesis] Model failed, trying next");
    }
  }
  throw new Error("All synthesis models exhausted");
}

async function callModelNonStreaming(
  client: any,
  modelId: string,
  prompt: string,
  maxTokens: number,
  agendaContext?: { agendaText: string; topicType?: string }
): Promise<string> {
  const systemPrompt = agendaContext
    ? buildSynthesisSystemPrompt(agendaContext.agendaText, agendaContext.topicType)
    : BESTDEL_BASE_SYNTHESIS_SYSTEM;

  const response = await client.chat.completions.create({
    model: modelId,
    max_tokens: maxTokens,
    temperature: 0.25,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    stream: false,
  });
  return response.choices?.[0]?.message?.content ?? "";
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
