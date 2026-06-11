import { Router } from "express";
import { z } from "zod";
import {
  listArchives as listArchivesDb, 
  createArchive as createArchiveDb, 
  updateArchive as updateArchiveDb,
  getArchiveById,
  deleteArchive,
  getConversationsByArchiveId,
  countArchives,
  countConversationsByArchiveId,
  getArchiveResearchAngles,
  listArchiveResearchAngles,
  upsertArchiveResearchAngles,
  toApiArchive,
  type ApiArchiveRecord,
  type ArchiveRecord
} from "../db.js";
import { getGeminiClient, isGeminiEnabled } from "../lib/gemini-client.js";
import { getRequestOwnerId } from "../lib/request-auth.js";

export type { ArchiveRecord, ApiArchiveRecord };

export type ArchiveRecordWithAngles = ApiArchiveRecord & {
  researchAngles?: string[];
};

export type DeleteArchiveIfSafeResult =
  | { status: "deleted"; archive: ArchiveRecordWithAngles }
  | { status: "not_found" }
  | { status: "last_archive" }
  | { status: "has_conversations" };

type CreateArchiveInput = {
  name: string;
  topic: string;
};

type UpdateArchiveInput = {
  name?: string;
  topic?: string;
};

type AnglesMeta = {
  generatedAt?: string;
  model?: string;
  version?: string;
};

export interface ArchivesStore {
  listArchives(ownerUserId: string): Promise<ArchiveRecordWithAngles[]>;
  createArchive(input: CreateArchiveInput, ownerUserId: string): Promise<ApiArchiveRecord>;
  updateArchive(id: number, input: UpdateArchiveInput, ownerUserId: string): Promise<ApiArchiveRecord | null>;
  getResearchAngles(id: number): Promise<{ archiveId: number; angles: string[]; meta: AnglesMeta } | null>;
  setResearchAngles(id: number, angles: string[], meta: AnglesMeta | undefined, ownerUserId: string): Promise<{ archiveId: number; angles: string[]; meta: AnglesMeta } | null>;
  deleteArchiveIfSafe(id: number, ownerUserId: string): Promise<DeleteArchiveIfSafeResult>;
}

const CreateArchiveBody = z.object({
  name: z.string().trim().min(1).max(120),
  topic: z.string().trim().min(3).max(300),
});

const UpdateArchiveBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().min(3).max(300).optional(),
}).refine((data) => data.name || data.topic, {
  message: "name or topic is required",
});

const ArchiveParams = z.object({ id: z.coerce.number().int().positive() });
const ResearchAnglesBody = z.object({
  angles: z.array(z.string().trim().min(3).max(220)).min(1).max(20),
});
const GenerateAnglesBody = z.object({
  topic: z.string().trim().min(3).max(300).optional(),
  committee: z.string().trim().min(2).max(120).optional(),
});

function parseJsonArray(text: string): string[] {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  } catch {
    return [];
  }
}

function parseMeta(text: string): AnglesMeta {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return {};
    return {
      generatedAt: typeof (parsed as any).generatedAt === "string" ? (parsed as any).generatedAt : undefined,
      model: typeof (parsed as any).model === "string" ? (parsed as any).model : undefined,
      version: typeof (parsed as any).version === "string" ? (parsed as any).version : undefined,
    };
  } catch {
    return {};
  }
}

function buildHeuristicAngles(topic: string, committee?: string): string[] {
  const t = topic.trim();
  const c = committee?.trim();
  const base = [
    `Core background and timeline of ${t}`,
    `Immediate triggers and root causes behind ${t}`,
    `Statistical impact: deaths, displacement, and economic loss in ${t}`,
    `India's official position and diplomatic stakes on ${t}`,
    `UN resolutions, international law, and legal obligations related to ${t}`,
    `Geopolitical implications for regional and global stability around ${t}`,
    `Media narratives, propaganda risks, and information integrity in ${t}`,
    `Policy options and negotiation pathways for de-escalation in ${t}`,
    `Human rights and democratic-space implications linked to ${t}`,
    `Most likely committee interventions and bloc positions for ${t}`,
  ];
  if (c) base.unshift(`${c} mandate-specific framing for ${t}`);
  return [...new Set(base)].slice(0, 12);
}

async function generateAngles(topic: string, committee?: string): Promise<{ angles: string[]; meta: AnglesMeta }> {
  const fallback = buildHeuristicAngles(topic, committee);
  if (!isGeminiEnabled()) {
    return { angles: fallback, meta: { generatedAt: new Date().toISOString(), model: "heuristic", version: "v1" } };
  }
  try {
    const gemini = getGeminiClient();
    const prompt = [
      "Generate 10 concise research angles for an MUN archive topic.",
      "Each angle must be actionable for web research and source collection.",
      "Cover data, legal, policy, human rights, geopolitical, and narrative dimensions.",
      "Return ONLY valid JSON array of strings.",
      committee ? `Committee: ${committee}` : "",
      `Topic: ${topic}`,
    ].filter(Boolean).join("\n");
    const resp = await gemini.chat.completions.create({
      model: "gemini-2.5-flash",
      temperature: 0.2,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const parsed = parseJsonArray(jsonMatch ? jsonMatch[0] : text);
    const angles = parsed.length >= 6 ? parsed.slice(0, 12) : fallback;
    return {
      angles,
      meta: { generatedAt: new Date().toISOString(), model: "gemini-2.5-flash", version: "v1" },
    };
  } catch {
    return { angles: fallback, meta: { generatedAt: new Date().toISOString(), model: "heuristic", version: "v1" } };
  }
}

const supabaseArchivesStore: ArchivesStore = {
  async listArchives(ownerUserId) {
    const rows = await listArchivesDb(ownerUserId);
    const anglesByArchiveId = new Map(
      (await listArchiveResearchAngles(rows.map((row) => row.id)))
        .map((angles) => [angles.archive_id, angles] as const),
    );
    return rows.map((row) => {
      const angles = anglesByArchiveId.get(row.id);
      return {
        ...toApiArchive(row),
        researchAngles: parseJsonArray(angles?.angles_json ?? '[]'),
      };
    });
  },
  async createArchive(input, ownerUserId) {
    try {
      const archive = await createArchiveDb(input.name, input.topic, ownerUserId);
      void upsertArchiveResearchAngles(archive.id, [], {}).catch((err) => {
        console.error("[archives] Failed to initialize research angles:", err);
      });
      return toApiArchive(archive);
    } catch (err) {
      console.error("[archives] createArchive failed:", err);
      throw err;
    }
  },
  async updateArchive(id, input, ownerUserId) {
    const updated = await updateArchiveDb(id, input, ownerUserId);
    return updated ? toApiArchive(updated) : null;
  },
  async getResearchAngles(id) {
    const row = await getArchiveResearchAngles(id);
    if (!row) return null;
    return { 
      archiveId: id, 
      angles: parseJsonArray(row.angles_json), 
      meta: parseMeta(row.meta_json) 
    };
  },
  async setResearchAngles(id, angles, meta, ownerUserId) {
    const archive = await getArchiveById(id, ownerUserId);
    if (!archive) return null;
    const result = await upsertArchiveResearchAngles(id, angles.slice(0, 20), meta ?? {});
    return { archiveId: id, angles: angles.slice(0, 20), meta: meta ?? {} };
  },
  async deleteArchiveIfSafe(id, ownerUserId) {
    const archive = await getArchiveById(id, ownerUserId);
    if (!archive) return { status: "not_found" as const };

    const archiveCount = await countArchives(ownerUserId);
    if (archiveCount <= 1) return { status: "last_archive" as const };

    const conversationCount = await countConversationsByArchiveId(id, ownerUserId);
    if (conversationCount > 0) return { status: "has_conversations" as const };

    await deleteArchive(id, ownerUserId);
    return { status: "deleted" as const, archive: { ...toApiArchive(archive), researchAngles: [] } };
  },
};

export function createArchivesRouter(store: ArchivesStore = supabaseArchivesStore) {
  const router = Router();

  router.get("/archives", async (req, res) => {
    const rows = await store.listArchives(getRequestOwnerId(req));
    res.json({ archives: rows });
  });

  router.post("/archives", async (req, res) => {
    const parsed = CreateArchiveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    try {
      const archiveInput = parsed.data as CreateArchiveInput;
      const archive = await store.createArchive(archiveInput, getRequestOwnerId(req));
      res.status(201).json(archive);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[archives] Failed to create archive:", message);
      if (stack) console.error(stack);
      res.status(500).json({
        error: "Failed to create archive",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      });
    }
  });

  router.patch("/archives/:id", async (req, res) => {
    const params = ArchiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const body = UpdateArchiveBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    try {
      const updateInput = body.data as UpdateArchiveInput;
      const updated = await store.updateArchive(params.data.id, updateInput, getRequestOwnerId(req));
      if (!updated) {
        res.status(404).json({ error: "Archive not found" });
        return;
      }

      res.json(updated);
    } catch (err) {
      console.error("[archives] Failed to update archive:", err);
      res.status(500).json({ error: "Failed to update archive" });
    }
  });

  router.delete("/archives/:id", async (req, res) => {
    const params = ArchiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const result = await store.deleteArchiveIfSafe(params.data.id, getRequestOwnerId(req));
      if (result.status === "deleted") {
        res.status(204).end();
        return;
      }
      if (result.status === "not_found") {
        res.status(404).json({ error: "Archive not found" });
        return;
      }
      if (result.status === "last_archive") {
        res.status(400).json({ error: "At least one archive must remain" });
        return;
      }
      res.status(409).json({ error: "Archive still contains chats" });
    } catch (err) {
      console.error("[archives] Failed to delete archive:", err);
      res.status(500).json({ error: "Failed to delete archive" });
    }
  });

  router.get("/archives/:id/research-angles", async (req, res) => {
    const params = ArchiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const archive = await getArchiveById(params.data.id, getRequestOwnerId(req));
    if (!archive) {
      res.status(404).json({ error: "Archive not found" });
      return;
    }
    const found = await store.getResearchAngles(params.data.id);
    if (!found) {
      res.status(404).json({ error: "Archive not found" });
      return;
    }
    res.json(found);
  });

  router.patch("/archives/:id/research-angles", async (req, res) => {
    const params = ArchiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = ResearchAnglesBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const archive = await getArchiveById(params.data.id, getRequestOwnerId(req));
    if (!archive) {
      res.status(404).json({ error: "Archive not found" });
      return;
    }
    const updated = await store.setResearchAngles(params.data.id, body.data.angles, {
      generatedAt: new Date().toISOString(),
      model: "user-edited",
      version: "v1",
    }, getRequestOwnerId(req));
    if (!updated) {
      res.status(404).json({ error: "Archive not found" });
      return;
    }
    res.json(updated);
  });

  router.post("/archives/:id/research-angles/generate", async (req, res) => {
    const params = ArchiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = GenerateAnglesBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const archive = await getArchiveById(params.data.id, getRequestOwnerId(req));
    if (!archive) {
      res.status(404).json({ error: "Archive not found" });
      return;
    }
    const topic = body.data.topic?.trim() || archive.topic;
    const generated = await generateAngles(topic, body.data.committee);
    const saved = await store.setResearchAngles(params.data.id, generated.angles, generated.meta, getRequestOwnerId(req));
    res.json(saved);
  });

  return router;
}

export default createArchivesRouter();
