import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

// Supabase table types
export interface ArchiveRecord {
  id: number;
  owner_user_id?: string | null;
  name: string;
  topic: string;
  researchAngles?: string[];
  created_at: string;
  updated_at: string;
}

export interface ConversationRecord {
  id: number;
  owner_user_id?: string | null;
  archive_id: number;
  title: string;
  created_at: string;
}

export interface MessageRecord {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  metadata_json?: string | null;
  run_id?: string | null;
  run_status?: string | null;
  run_phase?: string | null;
  run_last_heartbeat_at?: string | null;
  created_at: string;
}

export interface ApiArchiveRecord {
  id: number;
  name: string;
  topic: string;
  researchAngles?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiConversationRecord {
  id: number;
  archiveId: number;
  title: string;
  createdAt: string;
}

export interface ApiMessageRecord {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  metadataJson?: string | null;
  runId?: string | null;
  runStatus?: string | null;
  runPhase?: string | null;
  runLastHeartbeatAt?: string | null;
  createdAt: string;
}

export interface ArchiveContextRecord {
  archive_id: number;
  summary: string;
  updated_at: string;
}

export interface ArchiveResearchAnglesRecord {
  archive_id: number;
  angles_json: string;
  meta_json: string;
  updated_at: string;
}

export interface ArchiveIntelligenceProfileRecord {
  id: number;
  archive_id: number;
  agenda_text?: string | null;
  committee_type?: string | null;
  agenda_class?: string | null;
  primary_dimensions?: string | null;
  completed_divisions?: string | null;
  evidence_registry?: string | null;
  debate_utility_log?: string | null;
  dimension_engine_hash?: string | null;
  session_count?: number | null;
  updated_at?: string | null;
}

let _supabase: SupabaseClient | null = null;

interface LocalDbState {
  nextIds: {
    archive: number;
    conversation: number;
    message: number;
    archiveIntelligenceProfile: number;
  };
  archives: ArchiveRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  archiveContexts: ArchiveContextRecord[];
  archiveResearchAngles: ArchiveResearchAnglesRecord[];
  archiveIntelligenceProfiles: ArchiveIntelligenceProfileRecord[];
}

const localDbFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'bestdel.local-db.json',
);

let localDbState: LocalDbState | null = null;
let localDbWriteQueue: Promise<void> = Promise.resolve();

function createEmptyLocalDb(): LocalDbState {
  return {
    nextIds: {
      archive: 1,
      conversation: 1,
      message: 1,
      archiveIntelligenceProfile: 1,
    },
    archives: [],
    conversations: [],
    messages: [],
    archiveContexts: [],
    archiveResearchAngles: [],
    archiveIntelligenceProfiles: [],
  };
}

function normalizeLocalDb(parsed: Partial<LocalDbState> | null | undefined): LocalDbState {
  const empty = createEmptyLocalDb();
  const state = {
    ...empty,
    ...(parsed ?? {}),
    nextIds: { ...empty.nextIds, ...(parsed?.nextIds ?? {}) },
    archives: Array.isArray(parsed?.archives) ? parsed.archives : [],
    conversations: Array.isArray(parsed?.conversations) ? parsed.conversations : [],
    messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
    archiveContexts: Array.isArray(parsed?.archiveContexts) ? parsed.archiveContexts : [],
    archiveResearchAngles: Array.isArray(parsed?.archiveResearchAngles) ? parsed.archiveResearchAngles : [],
    archiveIntelligenceProfiles: Array.isArray(parsed?.archiveIntelligenceProfiles) ? parsed.archiveIntelligenceProfiles : [],
  };

  state.nextIds.archive = Math.max(state.nextIds.archive, ...state.archives.map((r) => r.id + 1), 1);
  state.nextIds.conversation = Math.max(state.nextIds.conversation, ...state.conversations.map((r) => r.id + 1), 1);
  state.nextIds.message = Math.max(state.nextIds.message, ...state.messages.map((r) => r.id + 1), 1);
  state.nextIds.archiveIntelligenceProfile = Math.max(
    state.nextIds.archiveIntelligenceProfile,
    ...state.archiveIntelligenceProfiles.map((r) => r.id + 1),
    1,
  );

  return state;
}

async function loadLocalDb(): Promise<LocalDbState> {
  if (localDbState) return localDbState;

  try {
    const raw = await readFile(localDbFile, 'utf8');
    localDbState = normalizeLocalDb(JSON.parse(raw) as Partial<LocalDbState>);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      console.warn('[db] Local development DB could not be read; starting fresh:', err);
    }
    localDbState = createEmptyLocalDb();
  }

  return localDbState;
}

async function persistLocalDb(state: LocalDbState): Promise<void> {
  await mkdir(path.dirname(localDbFile), { recursive: true });
  await writeFile(localDbFile, JSON.stringify(state, null, 2), 'utf8');
}

async function mutateLocalDb<T>(mutator: (state: LocalDbState) => T | Promise<T>): Promise<T> {
  const operation = localDbWriteQueue.then(async () => {
    const state = await loadLocalDb();
    const result = await mutator(state);
    await persistLocalDb(state);
    return result;
  });
  localDbWriteQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim()),
  );
}

export function isUsingLocalDb(): boolean {
  return process.env.NODE_ENV !== 'production' && !hasSupabaseConfig();
}

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    // Prefer service role key for server-side; fall back to anon only if not set
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
      );
    }

    _supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    });
  }
  return _supabase;
}

export function toApiArchive(record: ArchiveRecord): ApiArchiveRecord {
  return {
    id: record.id,
    name: record.name,
    topic: record.topic,
    researchAngles: record.researchAngles,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function toApiConversation(record: ConversationRecord): ApiConversationRecord {
  return {
    id: record.id,
    archiveId: record.archive_id,
    title: record.title,
    createdAt: record.created_at,
  };
}

export function toApiMessage(record: MessageRecord): ApiMessageRecord {
  return {
    id: record.id,
    conversationId: record.conversation_id,
    role: record.role,
    content: record.content,
    metadataJson: record.metadata_json,
    runId: record.run_id,
    runStatus: record.run_status,
    runPhase: record.run_phase,
    runLastHeartbeatAt: record.run_last_heartbeat_at,
    createdAt: record.created_at,
  };
}

export async function listArchives(ownerUserId?: string): Promise<ArchiveRecord[]> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.archives
      .filter((archive) => !ownerUserId || archive.owner_user_id === ownerUserId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('archives')
    .select('*')
    .order('created_at', { ascending: true });
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function createArchive(name: string, topic: string, ownerUserId?: string): Promise<ArchiveRecord> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const now = new Date().toISOString();
      const archive: ArchiveRecord = {
        id: state.nextIds.archive++,
        owner_user_id: ownerUserId ?? null,
        name,
        topic,
        created_at: now,
        updated_at: now,
      };
      state.archives.push(archive);
      return archive;
    });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('archives')
    .insert([{ name, topic, owner_user_id: ownerUserId ?? null, created_at: now, updated_at: now }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateArchive(
  id: number,
  updates: { name?: string; topic?: string },
  ownerUserId?: string,
): Promise<ArchiveRecord | null> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const found = state.archives.find((archive) => archive.id === id && (!ownerUserId || archive.owner_user_id === ownerUserId));
      if (!found) return null;
      if (updates.name !== undefined) found.name = updates.name;
      if (updates.topic !== undefined) found.topic = updates.topic;
      found.updated_at = new Date().toISOString();
      return found;
    });
  }

  const supabase = getSupabaseClient();
  const updateData: Partial<ArchiveRecord> = { ...updates, updated_at: new Date().toISOString() };
  
  let query = supabase
    .from('archives')
    .update(updateData)
    .eq('id', id)
    .select();
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { data, error } = await query.single();

  if (error) throw error;
  return data;
}

export async function getArchiveById(id: number, ownerUserId?: string): Promise<ArchiveRecord | null> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.archives.find((archive) => archive.id === id && (!ownerUserId || archive.owner_user_id === ownerUserId)) ?? null;
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('archives')
    .select('*')
    .eq('id', id);
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { data, error } = await query.single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function deleteArchive(id: number, ownerUserId?: string): Promise<boolean> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const canDelete = state.archives.some((archive) => archive.id === id && (!ownerUserId || archive.owner_user_id === ownerUserId));
      if (!canDelete) return false;
      state.archives = state.archives.filter((archive) => archive.id !== id);
      state.archiveContexts = state.archiveContexts.filter((context) => context.archive_id !== id);
      state.archiveResearchAngles = state.archiveResearchAngles.filter((angles) => angles.archive_id !== id);
      state.archiveIntelligenceProfiles = state.archiveIntelligenceProfiles.filter((profile) => profile.archive_id !== id);
      return true;
    });
  }

  const supabase = getSupabaseClient();
  let query = supabase.from('archives').delete().eq('id', id);
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { error } = await query;
  if (error) throw error;
  return true;
}

export async function getConversationsByArchiveId(archiveId: number, ownerUserId?: string): Promise<ConversationRecord[]> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.conversations
      .filter((conversation) => conversation.archive_id === archiveId && (!ownerUserId || conversation.owner_user_id === ownerUserId))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('conversations')
    .select('*')
    .eq('archive_id', archiveId)
    .order('created_at', { ascending: true });
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function listConversations(ownerUserId?: string): Promise<ConversationRecord[]> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.conversations
      .filter((conversation) => !ownerUserId || conversation.owner_user_id === ownerUserId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('conversations')
    .select('*')
    .order('created_at', { ascending: true });
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function createConversation(
  archiveId: number,
  title: string,
  ownerUserId?: string,
): Promise<ConversationRecord> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const conversation: ConversationRecord = {
        id: state.nextIds.conversation++,
        owner_user_id: ownerUserId ?? null,
        archive_id: archiveId,
        title,
        created_at: new Date().toISOString(),
      };
      state.conversations.push(conversation);
      return conversation;
    });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('conversations')
    .insert([{ archive_id: archiveId, owner_user_id: ownerUserId ?? null, title, created_at: now }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getConversationById(id: number, ownerUserId?: string): Promise<ConversationRecord | null> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.conversations.find((conversation) => conversation.id === id && (!ownerUserId || conversation.owner_user_id === ownerUserId)) ?? null;
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('conversations')
    .select('*')
    .eq('id', id);
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { data, error } = await query.single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function updateConversationTitle(id: number, title: string, ownerUserId?: string): Promise<ConversationRecord | null> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const found = state.conversations.find((conversation) => conversation.id === id && (!ownerUserId || conversation.owner_user_id === ownerUserId));
      if (!found) return null;
      found.title = title;
      return found;
    });
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('conversations')
    .update({ title })
    .eq('id', id)
    .select();
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { data, error } = await query.single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function deleteConversation(id: number, ownerUserId?: string): Promise<ConversationRecord | null> {
  const conversation = await getConversationById(id, ownerUserId);
  if (!conversation) return null;

  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      state.conversations = state.conversations.filter((item) => item.id !== id);
      state.messages = state.messages.filter((message) => message.conversation_id !== id);
      return conversation;
    });
  }

  const supabase = getSupabaseClient();
  let query = supabase.from('conversations').delete().eq('id', id);
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { error } = await query;
  if (error) throw error;
  return conversation;
}

export async function getMessagesByConversationId(
  conversationId: number
): Promise<MessageRecord[]> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.messages
      .filter((message) => message.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createMessage(
  conversationId: number,
  role: string,
  content: string,
  metadata?: Record<string, unknown> | null,
  runId?: string | null,
  runStatus?: string | null
): Promise<MessageRecord> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const now = new Date().toISOString();
      const message: MessageRecord = {
        id: state.nextIds.message++,
        conversation_id: conversationId,
        role,
        content,
        metadata_json: metadata ? JSON.stringify(metadata) : null,
        run_id: runId ?? null,
        run_status: runStatus ?? null,
        run_phase: runStatus ? 'terminal' : null,
        run_last_heartbeat_at: runStatus ? now : null,
        created_at: now,
      };
      state.messages.push(message);
      return message;
    });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      conversation_id: conversationId,
      role,
      content,
      metadata_json: metadata ? JSON.stringify(metadata) : null,
      run_id: runId ?? null,
      run_status: runStatus ?? null,
      run_phase: runStatus ? 'terminal' : null,
      run_last_heartbeat_at: runStatus ? now : null,
      created_at: now
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createMessageFromJson(
  conversationId: number,
  role: string,
  content: string,
  metadataJson?: string | null,
  runId?: string | null,
  runStatus?: string | null
): Promise<MessageRecord> {
  const parsedMetadata = safeParseJson(metadataJson);
  return createMessage(conversationId, role, content, parsedMetadata, runId, runStatus);
}

function safeParseJson(json: string | null | undefined): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function updateMessage(
  id: number,
  updates: {
    content?: string;
    metadataJson?: string | null;
    runId?: string | null;
    runStatus?: string | null;
  }
): Promise<MessageRecord | null> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const found = state.messages.find((message) => message.id === id);
      if (!found) return null;
      const now = new Date().toISOString();
      if (updates.content !== undefined) found.content = updates.content;
      if (updates.metadataJson !== undefined) found.metadata_json = updates.metadataJson;
      if (updates.runId !== undefined) found.run_id = updates.runId;
      if (updates.runStatus !== undefined) {
        found.run_status = updates.runStatus;
        found.run_phase = 'terminal';
        found.run_last_heartbeat_at = now;
      }
      return found;
    });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {};

  if (updates.content !== undefined) updateData.content = updates.content;
  if (updates.metadataJson !== undefined) updateData.metadata_json = updates.metadataJson;
  if (updates.runId !== undefined) updateData.run_id = updates.runId;
  if (updates.runStatus !== undefined) {
    updateData.run_status = updates.runStatus;
    updateData.run_phase = 'terminal';
    updateData.run_last_heartbeat_at = now;
  }

  const { data, error } = await supabase
    .from('messages')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function getArchiveContext(archiveId: number): Promise<ArchiveContextRecord | null> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.archiveContexts.find((context) => context.archive_id === archiveId) ?? null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('archive_contexts')
    .select('*')
    .eq('archive_id', archiveId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function upsertArchiveContext(
  archiveId: number,
  summary: string
): Promise<ArchiveContextRecord> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const now = new Date().toISOString();
      const found = state.archiveContexts.find((context) => context.archive_id === archiveId);
      if (found) {
        found.summary = summary;
        found.updated_at = now;
        return found;
      }
      const context = { archive_id: archiveId, summary, updated_at: now };
      state.archiveContexts.push(context);
      return context;
    });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('archive_contexts')
    .upsert([{ archive_id: archiveId, summary, updated_at: now }], { onConflict: 'archive_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getArchiveResearchAngles(
  archiveId: number
): Promise<ArchiveResearchAnglesRecord | null> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.archiveResearchAngles.find((angles) => angles.archive_id === archiveId) ?? null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('archive_research_angles')
    .select('*')
    .eq('archive_id', archiveId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function listArchiveResearchAngles(
  archiveIds: number[]
): Promise<ArchiveResearchAnglesRecord[]> {
  const ids = [...new Set(archiveIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return [];

  if (isUsingLocalDb()) {
    const idSet = new Set(ids);
    const state = await loadLocalDb();
    return state.archiveResearchAngles.filter((angles) => idSet.has(angles.archive_id));
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('archive_research_angles')
    .select('*')
    .in('archive_id', ids);

  if (error) throw error;
  return data || [];
}

export async function upsertArchiveResearchAngles(
  archiveId: number,
  angles: string[],
  meta: Record<string, unknown> = {}
): Promise<ArchiveResearchAnglesRecord> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const now = new Date().toISOString();
      const found = state.archiveResearchAngles.find((entry) => entry.archive_id === archiveId);
      if (found) {
        found.angles_json = JSON.stringify(angles);
        found.meta_json = JSON.stringify(meta);
        found.updated_at = now;
        return found;
      }
      const entry = {
        archive_id: archiveId,
        angles_json: JSON.stringify(angles),
        meta_json: JSON.stringify(meta),
        updated_at: now,
      };
      state.archiveResearchAngles.push(entry);
      return entry;
    });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('archive_research_angles')
    .upsert([{
      archive_id: archiveId,
      angles_json: JSON.stringify(angles),
      meta_json: JSON.stringify(meta),
      updated_at: now
    }], { onConflict: 'archive_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getArchiveIntelligenceProfile(
  archiveId: number
): Promise<ArchiveIntelligenceProfileRecord | null> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.archiveIntelligenceProfiles.find((profile) => profile.archive_id === archiveId) ?? null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('archive_intelligence_profiles')
    .select('*')
    .eq('archive_id', archiveId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function upsertArchiveIntelligenceProfile(
  archiveId: number,
  profile: Partial<Omit<ArchiveIntelligenceProfileRecord, 'id' | 'archive_id' | 'updated_at'>>
): Promise<ArchiveIntelligenceProfileRecord> {
  if (isUsingLocalDb()) {
    return mutateLocalDb((state) => {
      const now = new Date().toISOString();
      const found = state.archiveIntelligenceProfiles.find((entry) => entry.archive_id === archiveId);
      if (found) {
        Object.assign(found, profile, { updated_at: now });
        return found;
      }
      const entry: ArchiveIntelligenceProfileRecord = {
        id: state.nextIds.archiveIntelligenceProfile++,
        archive_id: archiveId,
        ...profile,
        updated_at: now,
      };
      state.archiveIntelligenceProfiles.push(entry);
      return entry;
    });
  }

  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('archive_intelligence_profiles')
    .upsert([{
      archive_id: archiveId,
      ...profile,
      updated_at: now
    }], { onConflict: 'archive_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function countArchives(ownerUserId?: string): Promise<number> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.archives.filter((archive) => !ownerUserId || archive.owner_user_id === ownerUserId).length;
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('archives')
    .select('*', { count: 'exact', head: true });
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { count, error } = await query;

  if (error) throw error;
  return count || 0;
}

export async function countConversationsByArchiveId(archiveId: number, ownerUserId?: string): Promise<number> {
  if (isUsingLocalDb()) {
    const state = await loadLocalDb();
    return state.conversations.filter((conversation) => conversation.archive_id === archiveId && (!ownerUserId || conversation.owner_user_id === ownerUserId)).length;
  }

  const supabase = getSupabaseClient();
  let query = supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('archive_id', archiveId);
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const { count, error } = await query;

  if (error) throw error;
  return count || 0;
}
