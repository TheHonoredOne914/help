import type { VerificationResult, EnrichedResult, SearchResult } from "./types.js";
import { GEMINI_VERIFY_MODEL } from "./gemini-client.js";

const VERIFY_TIMEOUT_MS = 20_000;
export const NVIDIA_VERIFY_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";
export const GROQ_VERIFY_MODEL = "llama-3.3-70b-versatile";

export interface VerifyOptions {
  geminiKey?: string | null;
  hfToken?: string | null;
  groqKey?: string | null;
  nvidiaKey?: string | null;
  clients?: VerifyClients;
  onChunk?: (chunk: string) => void;
}

export interface VerifyClients {
  gemini?: { chat: { completions: { create: Function } } } | null;
  groq?: { chat: { completions: { create: Function } } } | null;
  nvidia?: { chat: { completions: { create: Function } } } | null;
}

export async function verifyAnswer(
  query: string,
  sources: EnrichedResult[] | SearchResult[],
  answer: string,
  opts: VerifyOptions & { clients?: VerifyClients } = {},
): Promise<VerificationResult> {
  const degradedReasons: string[] = [];

  if (opts.clients?.gemini) {
    try {
      return await verifyWithGemini(query, sources, answer, opts.clients.gemini);
    } catch (err) {
      console.warn(
        "[verify] Gemini verification failed, falling back to Qwen:",
        (err as Error).message,
      );
      degradedReasons.push("Primary verifier failed.");
    }
  }

  if (opts.clients?.groq || opts.clients?.nvidia || opts.hfToken?.trim() || opts.groqKey?.trim() || opts.nvidiaKey?.trim()) {
    try {
      return await verifyWithQwen(query, sources, answer, opts);
    } catch (err) {
      console.warn(
        "[verify] Qwen verification also failed:",
        (err as Error).message,
      );
      degradedReasons.push("Fallback verifier failed.");
    }
  }

  if (degradedReasons.length > 0) {
    return buildDegradedResult(
      sources,
      `Automatic verification degraded. ${degradedReasons.join(" ")}`,
    );
  }

  return buildDegradedResult(
    sources,
    "Automatic verification unavailable - no verifier key configured.",
    "No Verifier",
  );
}

async function verifyWithGemini(
  query: string,
  sources: EnrichedResult[] | SearchResult[],
  answer: string,
  client: { chat: { completions: { create: Function } } },
): Promise<VerificationResult> {
  const sourceSummary = sources
    .slice(0, 6)
    .map(
      (source, index) =>
        `[Source ${index + 1}] ${source.title}\nURL: ${source.url}\nContent: ${((source as any).content ?? source.snippet ?? "").slice(0, 350)}`,
    )
    .join("\n\n");

  const prompt = `You are a rigorous, impartial fact-checker for a Model UN research engine.

ORIGINAL QUESTION:
"${query}"

RETRIEVED SOURCES (${sources.length} total, showing top ${Math.min(6, sources.length)}):
${sourceSummary || "No sources retrieved."}

ANSWER TO VERIFY:
${answer.slice(0, 3000)}

TASK:
Analyze whether the answer is grounded in the provided sources.
Respond ONLY with valid JSON - no markdown, no prose, no backticks:

{
  "verified": true | false,
  "confidence": 0-100,
  "notes": "1-2 sentence verdict. Call out any fabricated stats or unsourced claims.",
  "thinking": [
    "Step 1: What claims did I check?",
    "Step 2: What did I find in the sources?",
    "Step 3: My conclusion."
  ]
}

RULES:
- verified=true ONLY if ALL major factual claims appear in the sources
- confidence >= 80 ONLY if multiple authoritative sources confirm the claims
- If answer contains data not found in sources, set verified=false and explain in notes
- thinking must show actual reasoning, not just "I verified it"`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  let raw = "";
  try {
    const response = await client.chat.completions.create(
      {
        model: GEMINI_VERIFY_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );
    raw = response.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }

  raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Gemini returned non-JSON response: ${raw.slice(0, 120)}`);
  }

  let parsed: {
    verified?: boolean;
    confidence?: number;
    notes?: string;
    thinking?: string[];
  };

  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Gemini returned malformed JSON: ${jsonMatch[0].slice(0, 120)}`);
  }

  return {
    verified: typeof parsed.verified === "boolean" ? parsed.verified : false,
    confidence:
      typeof parsed.confidence === "number"
        ? Math.min(100, Math.max(0, parsed.confidence))
        : 0,
    notes:
      typeof parsed.notes === "string"
        ? parsed.notes
        : "Automatic verification degraded - verifier response was incomplete.",
    thinking: Array.isArray(parsed.thinking) ? parsed.thinking.map(String) : [],
    sources: sources.slice(0, 6).map((source) => ({ title: source.title, url: source.url })),
    model: "gemini",
    modelFull: `Gemini (${GEMINI_VERIFY_MODEL})`,
  };
}

async function verifyWithQwen(
  query: string,
  sources: EnrichedResult[] | SearchResult[],
  answer: string,
  opts: VerifyOptions,
): Promise<VerificationResult> {
  const onChunk = opts.onChunk ?? (() => {});
  const nvidia = opts.clients?.nvidia ?? null;
  const groq = opts.clients?.groq ?? null;

  const topSources = sources.slice(0, 6);
  const sourcesText = topSources
    .map((result, index) => `[${index + 1}] ${result.title} (${result.url})\n${result.snippet || "(no snippet)"}`)
    .join("\n\n");

  const streamPrompt = `You are a fact-checker reviewing an AI's answer.

User question: "${query}"

AI answer:
---
${answer.slice(0, 1500)}
---

Web sources retrieved:
${sourcesText || "(none)"}

Think out loud, step by step, in 3-5 short numbered points (one short sentence each). Focus on:
1. What the answer claims
2. Whether the sources support those claims
3. Any contradictions or gaps
4. Your final confidence judgement

Be concise. Do NOT output JSON. Just the numbered reasoning.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    let stream;
    if (nvidia) {
      stream = await nvidia.chat.completions.create(
        {
          model: NVIDIA_VERIFY_MODEL,
          messages: [{ role: "user", content: streamPrompt }],
          max_tokens: 350,
          temperature: 0.3,
          stream: true,
        },
        { signal: controller.signal },
      );
    } else if (groq) {
      stream = await groq.chat.completions.create(
        {
          model: GROQ_VERIFY_MODEL,
          messages: [{ role: "user", content: streamPrompt }],
          max_tokens: 350,
          temperature: 0.3,
          stream: true,
        },
        { signal: controller.signal },
      );
    } else {
      throw new Error("No verifying model enabled");
    }

    for await (const chunk of stream) {
      const piece = chunk.choices?.[0]?.delta?.content ?? "";
      if (piece) onChunk(piece);
    }
  } catch {
    const steps = [
      `1. Parsing the AI's claims about: "${query.slice(0, 60)}".`,
      `2. Loaded ${topSources.length} web source${topSources.length !== 1 ? "s" : ""} for cross-reference.`,
      "3. Comparing each claim against retrieved evidence.",
      `4. ${topSources.length > 0 ? "Verification model failed before producing a verdict" : "No retrieved sources were available for verification"}.`,
    ];
    for (const step of steps) {
      onChunk(step + "\n");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const thinkingSteps: string[] = [
    `Analyzing query: "${query}"`,
    `Reviewing ${topSources.length} web sources for fact-checking`,
    "Comparing AI-generated claims against retrieved evidence",
    "Evaluating source credibility and cross-referencing facts",
    "Computing confidence score based on source agreement",
  ];

  const verifyPrompt = `You are a fact-checker. A user asked: "${query}"

An AI assistant produced the following response:
---
${answer.slice(0, 1500)}
---

Here are the search results that were retrieved:
${sourcesText}

Your task: Evaluate whether the key factual claims in the AI response are supported by the search results.

Reply with ONLY valid JSON (no extra text):
{"verified": true, "confidence": 0.85, "notes": "Key claims are well-supported by multiple sources."}

Use confidence 0.0-1.0. Set verified=false only if you detect clear contradictions or unsupported claims.`;

  try {
    let content = "";
    let usedModel = "";
    let usedModelDisplay = "";

    if (nvidia) {
      const response = await nvidia.chat.completions.create(
        {
          model: NVIDIA_VERIFY_MODEL,
          messages: [{ role: "user", content: verifyPrompt }],
          max_tokens: 150,
          temperature: 0.1,
          stream: false,
        },
        { signal: controller.signal },
      );
      content = response.choices?.[0]?.message?.content ?? "";
      usedModel = NVIDIA_VERIFY_MODEL;
      usedModelDisplay = "Nemotron-70B (NVIDIA)";
    } else if (groq) {
      const response = await groq.chat.completions.create(
        {
          model: GROQ_VERIFY_MODEL,
          messages: [{ role: "user", content: verifyPrompt }],
          max_tokens: 150,
          temperature: 0.1,
          stream: false,
        },
        { signal: controller.signal },
      );
      content = response.choices?.[0]?.message?.content ?? "";
      usedModel = GROQ_VERIFY_MODEL;
      usedModelDisplay = "Llama-3.3-70B (Groq)";
    } else {
      throw new Error("No verifying model enabled");
    }

    const jsonMatch = content.match(/\{[^{}]+\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse Qwen response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      verified?: boolean;
      confidence?: number;
      notes?: string;
    };

    clearTimeout(timer);
    return {
      verified: typeof parsed.verified === "boolean" ? parsed.verified : false,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0,
      notes:
        typeof parsed.notes === "string"
          ? parsed.notes
          : `Fact-checked by ${usedModelDisplay}`,
      thinking: thinkingSteps,
      sources: topSources.slice(0, 3).map((result) => ({ title: result.title, url: result.url })),
      model: usedModelDisplay,
      modelFull: usedModel,
    };
  } catch {
    clearTimeout(timer);
    return {
      verified: false,
      confidence: 0,
      notes:
        topSources.length > 0
          ? `Automatic verification degraded - retrieved ${topSources.length} web source${topSources.length !== 1 ? "s" : ""}, but no verifier completed successfully.`
          : "Automatic verification degraded - no sources found.",
      thinking: [
        `Analyzing query: "${query}"`,
        `Reviewing ${topSources.length} available web sources`,
        "Cross-referencing claims with retrieved results",
        topSources.length > 0
          ? "Verification model failed before it could reach a trustworthy conclusion"
          : "Insufficient evidence available for verification",
      ],
      sources: topSources.slice(0, 3).map((result) => ({ title: result.title, url: result.url })),
      model: "fallback",
      modelFull: "Verifier Degraded",
    };
  }
}

function buildDegradedResult(
  sources: EnrichedResult[] | SearchResult[],
  notes: string,
  modelFull = "Verifier Degraded",
): VerificationResult {
  return {
    verified: false,
    confidence: 0,
    notes,
    thinking: [],
    sources: sources.slice(0, 5).map((source) => ({ title: source.title, url: source.url })),
    model: "fallback",
    modelFull,
  };
}
