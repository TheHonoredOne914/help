import type { IRouter } from "express";
import { z } from "zod";

import {
  createConversation,
  deleteConversation,
  getArchiveById,
  getConversationById,
  getConversationsByArchiveId,
  getMessagesByConversationId,
  listConversations,
  toApiConversation,
  toApiMessage,
  updateConversationTitle,
} from "../db.js";
import { getCerebrasClient, isCerebrasEnabled } from "../lib/cerebras-client.js";
import { getGeminiClient, isGeminiEnabled } from "../lib/gemini-client.js";
import { getGroqClient, isGroqEnabled } from "../lib/groq-client.js";
import { getNvidiaClient, isNvidiaEnabled } from "../lib/nvidia-client.js";
import { multiKeyFetch } from "../lib/multi-key-fetch.js";
import { getRequestOwnerId } from "../lib/request-auth.js";

const CreateAnthropicConversationBody = z.object({
  title: z.string().min(1).max(200),
  archiveId: z.number().int().positive(),
});

const GetAnthropicConversationParams = z.object({ id: z.number().int().positive() });
const DeleteAnthropicConversationParams = z.object({ id: z.number().int().positive() });
const ListAnthropicMessagesParams = z.object({ id: z.number().int().positive() });
const ListAnthropicConversationsQuery = z.object({
  archiveId: z.coerce.number().int().positive().optional(),
});

export function registerAnthropicMetaRoutes(router: IRouter): void {
  router.get("/anthropic/conversations", async (req, res) => {
    const ownerUserId = getRequestOwnerId(req);
    const queryParsed = ListAnthropicConversationsQuery.safeParse(req.query);
    if (!queryParsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const convos = queryParsed.data.archiveId
      ? await getConversationsByArchiveId(queryParsed.data.archiveId, ownerUserId)
      : await listConversations(ownerUserId);
    res.json(convos.map(toApiConversation));
  });

  router.post("/anthropic/conversations", async (req, res) => {
    const ownerUserId = getRequestOwnerId(req);
    const parsed = CreateAnthropicConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const archive = await getArchiveById(parsed.data.archiveId, ownerUserId);
    if (!archive) {
      res.status(404).json({ error: "Archive not found" });
      return;
    }
    const convo = await createConversation(parsed.data.archiveId, parsed.data.title, ownerUserId);
    res.status(201).json(toApiConversation(convo));
  });

  router.patch("/anthropic/conversations/:id", async (req, res) => {
    const id = Number(req.params.id);
    const ownerUserId = getRequestOwnerId(req);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const updated = await updateConversationTitle(id, title.slice(0, 200), ownerUserId);
    if (!updated) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(toApiConversation(updated));
  });

  router.post("/anthropic/generate-title", async (req, res) => {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const fallback = () => content.split(/\s+/).slice(0, 5).join(" ");

    const groqKey = (req.headers["x-groq-api-key"] as string | undefined) ?? null;
    const nvidiaKey = (req.headers["x-nvidia-api-key"] as string | undefined) ?? null;
    const cerebrasKey = (req.headers["x-cerebras-api-key"] as string | undefined) ?? null;
    const geminiKey = (req.headers["x-gemini-api-key"] as string | undefined) ?? null;

    const titlePrompt = [
      { role: "system" as const, content: "Generate a concise 4-6 word title (no quotes, no punctuation) for this conversation." },
      { role: "user" as const, content: `Title for: ${content.slice(0, 500)}` },
    ];

    const providers: Array<{ name: string; key: string | null; baseUrl: string; model: string }> = [
      { name: "groq", key: groqKey ?? process.env.GROQ_API_KEY ?? null, baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
      { name: "nvidia", key: nvidiaKey ?? process.env.NVIDIA_API_KEY ?? null, baseUrl: "https://integrate.api.nvidia.com/v1", model: "nvidia/llama-3.1-nemotron-nano-8b-v1" },
      { name: "cerebras", key: cerebrasKey ?? process.env.CEREBRAS_API_KEY ?? null, baseUrl: "https://api.cerebras.ai/v1", model: "llama3.1-8b" },
      { name: "gemini", key: geminiKey ?? process.env.GEMINI_API_KEY ?? null, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
    ];

    let title = "";
    for (const provider of providers) {
      if (!provider.key) continue;
      try {
        if (provider.name === "groq" && isGroqEnabled(provider.key)) {
          const groq = getGroqClient(provider.key);
          const resp = await groq.chat.completions.create({
            model: provider.model,
            max_tokens: 20,
            messages: titlePrompt,
          });
          title = resp.choices?.[0]?.message?.content?.trim() ?? "";
        } else if (provider.name === "nvidia" && isNvidiaEnabled(provider.key)) {
          const nvidia = getNvidiaClient(provider.key);
          const resp = await nvidia.chat.completions.create({
            model: provider.model,
            max_tokens: 20,
            messages: titlePrompt,
          });
          title = resp.choices?.[0]?.message?.content?.trim() ?? "";
        } else if (provider.name === "cerebras" && isCerebrasEnabled(provider.key)) {
          const cerebras = getCerebrasClient(provider.key);
          const resp = await cerebras.chat.completions.create({
            model: provider.model,
            max_tokens: 20,
            messages: titlePrompt,
          });
          title = resp.choices?.[0]?.message?.content?.trim() ?? "";
        } else if (provider.name === "gemini" && isGeminiEnabled(provider.key)) {
          const resp = await multiKeyFetch(`${provider.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${provider.key}`,
            },
            body: JSON.stringify({ model: provider.model, max_tokens: 20, messages: titlePrompt }),
          });
          if (resp.ok) {
            const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
            title = data.choices?.[0]?.message?.content?.trim() ?? "";
          }
        } else {
          const resp = await multiKeyFetch(`${provider.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${provider.key}`,
            },
            body: JSON.stringify({ model: provider.model, max_tokens: 20, messages: titlePrompt }),
          });
          if (resp.ok) {
            const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
            title = data.choices?.[0]?.message?.content?.trim() ?? "";
          }
        }
        if (title) break;
      } catch {
        // Best-effort endpoint; keep trying providers.
      }
    }

    if (!title) title = fallback();
    res.json({ title: title.slice(0, 80) });
  });

  router.get("/anthropic/conversations/:id", async (req, res) => {
    const ownerUserId = getRequestOwnerId(req);
    const parsed = GetAnthropicConversationParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const convo = await getConversationById(parsed.data.id, ownerUserId);
    if (!convo) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await getMessagesByConversationId(parsed.data.id);
    res.json({ ...toApiConversation(convo), messages: msgs.map(toApiMessage) });
  });

  router.delete("/anthropic/conversations/:id", async (req, res) => {
    const ownerUserId = getRequestOwnerId(req);
    const parsed = DeleteAnthropicConversationParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await deleteConversation(parsed.data.id, ownerUserId);
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.status(204).end();
  });

  router.get("/anthropic/conversations/:id/messages", async (req, res) => {
    const ownerUserId = getRequestOwnerId(req);
    const parsed = ListAnthropicMessagesParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const convo = await getConversationById(parsed.data.id, ownerUserId);
    if (!convo) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await getMessagesByConversationId(parsed.data.id);
    res.json(msgs.map(toApiMessage));
  });
}
