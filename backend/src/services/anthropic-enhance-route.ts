import type { IRouter } from "express";

import { getCerebrasClient, isCerebrasEnabled } from "../lib/cerebras-client.js";
import { getGeminiClient, isGeminiEnabled } from "../lib/gemini-client.js";
import { getGroqClient, isGroqEnabled } from "../lib/groq-client.js";
import { getNvidiaClient, isNvidiaEnabled } from "../lib/nvidia-client.js";
import { classifyTopic, type TopicType } from "../lib/rag.js";
import { remapUnavailableGroqModelId } from "../core/providers/catalog/index.js";
import { extractKeys } from "../lib/provider-router.js";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export interface EnhanceRouteDependencies {
  callGeminiNonStreaming: (
    client: any,
    modelId: string,
    systemPrompt: string,
    messages: ChatMessage[],
    maxOutputTokens?: number,
  ) => Promise<string>;
}

function buildEnhanceInstruction(prompt: string, mode: string): string {
  const isResearch = mode === "web_search" || mode === "deep_research" || mode === "fast_research" || mode === "council";
  const topic = classifyTopic(prompt);

  const angleHints: Partial<Record<TopicType, string>> = {
    media_press:
      "Angles: RSF/CPJ/Freedom House index scores and trends, journalist UAPA/sedition " +
      "cases, Article 19 jurisprudence, government PIB counter-narrative.",
    democracy_civil_liberties:
      "Angles: Freedom House/V-Dem/EIU score trends, UAPA crackdowns, FCRA NGO " +
      "cancellations, internet shutdowns, HRW/Amnesty/CIVICUS, Supreme Court responses.",
    governance_policy:
      "Angles: CAG audit findings, NCRB statistics, PIB official position, " +
      "parliamentary committee reports, NITI Aayog data, India UN vote record.",
    legal:
      "Angles: Supreme Court and High Court judgements via indiankanoon.org, " +
      "constitutional articles, IPC/CrPC sections, PIL history, NHRC reports.",
    economic:
      "Angles: GDP data, Union Budget, RBI policy, NITI Aayog, IMF/World Bank, MoSPI.",
    environment:
      "Angles: India NDC, CPCB data, FSI forest report, MNRE energy, IPCC.",
    security:
      "Angles: MEA/MoD statements, SIPRI data, India UN peacekeeping, IDSA analysis.",
  };

  const angleHint = angleHints[topic]
    ?? "Angles: India MEA position, UN resolution numbers, bloc alignments, 2024-2025 data.";

  if (!isResearch) {
    return `Expand into a clearer, more specific Indian MUN research prompt.
Add 3-4 specific angles and source types. Under 120 words. Output ONLY the enhanced prompt.`;
  }

  return `You are a research strategist for Indian MUN delegates.
Rewrite the user's draft into a rich multi-angle research prompt maximizing web search quality.
Rules: under 200 words, add 4-6 topic-specific research angles, mention source
types (indices, court databases, reports), include year ranges 2022-2025.
Output ONLY the enhanced prompt.
Topic: ${topic.replace(/_/g, " ")}
${angleHint}`;
}

export function registerAnthropicEnhanceRoute(
  router: IRouter,
  deps: EnhanceRouteDependencies,
): void {
  router.post("/anthropic/enhance-prompt", async (req, res) => {
    const { prompt, mode } = req.body as { prompt?: string; mode?: string };
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }
    const keys = extractKeys(req);
    const draft = prompt.trim();
    const instruction = buildEnhanceInstruction(prompt, mode ?? "");
    const metaPrompt = `${instruction}\n\nDraft:\n"${draft}"`;

    try {
      if (isGroqEnabled(keys.groqKey)) {
        try {
          const groq = getGroqClient(keys.groqKey);
          const resp = await groq.chat.completions.create({
            model: remapUnavailableGroqModelId("llama-3.3-70b-versatile"),
            max_tokens: 400,
            temperature: 0.4,
            messages: [{ role: "user", content: metaPrompt }],
          });
          const content = (resp.choices[0]?.message?.content ?? "").trim();
          if (content) {
            res.json({ enhanced: content });
            return;
          }
        } catch (err) {
          (req as any).log?.warn?.({ err, provider: "groq" }, "Enhance: groq failed, trying next provider");
        }
      }

      if (isCerebrasEnabled(keys.cerebrasKey)) {
        try {
          const cerebras = getCerebrasClient(keys.cerebrasKey);
          const resp = await cerebras.chat.completions.create({
            model: "llama3.3-70b",
            max_tokens: 400,
            temperature: 0.4,
            messages: [{ role: "user", content: metaPrompt }],
          });
          const content = (resp.choices[0]?.message?.content ?? "").trim();
          if (content) {
            res.json({ enhanced: content });
            return;
          }
        } catch (err) {
          (req as any).log?.warn?.({ err, provider: "cerebras" }, "Enhance: cerebras failed, trying next provider");
        }
      }

      if (isGeminiEnabled(keys.geminiKey)) {
        try {
          const gemini = getGeminiClient(keys.geminiKey);
          const text = await deps.callGeminiNonStreaming(
            gemini,
            "gemini-2.0-flash",
            instruction,
            [{ role: "user", content: draft }],
            400,
          );
          const content = text.trim();
          if (content) {
            res.json({ enhanced: content });
            return;
          }
        } catch (err) {
          (req as any).log?.warn?.({ err, provider: "gemini" }, "Enhance: gemini failed, trying next provider");
        }
      }

      if (isNvidiaEnabled(keys.nvidiaKey)) {
        try {
          const nvidia = getNvidiaClient(keys.nvidiaKey);
          const resp = await nvidia.chat.completions.create({
            model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
            max_tokens: 400,
            messages: [{ role: "user", content: metaPrompt }],
          });
          const content = (resp.choices[0]?.message?.content ?? "").trim();
          if (content) {
            res.json({ enhanced: content });
            return;
          }
        } catch (err) {
          (req as any).log?.warn?.({ err, provider: "nvidia" }, "Enhance: nvidia failed, trying next provider");
        }
      }

      if (keys.openrouterKey) {
        try {
          const { getOpenRouterClient } = await import("../lib/openrouter-client.js");
          const openrouter = getOpenRouterClient(keys.openrouterKey);
          const resp = await openrouter.chat.completions.create({
            model: "meta-llama/llama-3.1-8b-instruct:free",
            max_tokens: 400,
            messages: [{ role: "user", content: metaPrompt }],
          });
          const content = (resp.choices[0]?.message?.content ?? "").trim();
          if (content) {
            res.json({ enhanced: content });
            return;
          }
        } catch (err) {
          (req as any).log?.warn?.({ err, provider: "openrouter" }, "Enhance: openrouter failed, returning original");
        }
      }

      res.status(502).json({ error: "Prompt enhancement failed. Try again." });
    } catch (err) {
      (req as any).log?.warn?.({ err }, "Enhance prompt failed");
      res.status(502).json({ error: "Prompt enhancement failed. Try again." });
    }
  });
}
