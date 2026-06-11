/**
 * Local stub for the generated `@workspace/api-client-react` package that the
 * uploaded codebase depends on. We re-implement just the few hooks the UI uses,
 * built on top of `apiFetch` (which already injects BYOK headers).
 *
 * The shapes mirror what the original client returned so the consumer code
 * needs no changes.
 */
import {
  useQuery,
  useMutation,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

// ----- Types --------------------------------------------------------------

export interface AnthropicMessage {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface AnthropicConversation {
  id: number;
  archiveId: number;
  title: string;
  createdAt: string;
  messages?: AnthropicMessage[];
}

export interface Archive {
  id: number;
  name: string;
  topic: string;
  researchAngles?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveResearchAngles {
  archiveId: number;
  angles: string[];
  meta?: { generatedAt?: string; model?: string; version?: string };
}

// ----- Header injection (no-op kept for compatibility) -------------------

// apiFetch already pulls BYOK headers from settings on every request, so this
// is just a stub for backwards compatibility with the upstream contract.
// SSE resume path: backend frames now include EventSource ids. The streaming
// caller should persist the latest MessageEvent.lastEventId and pass it as a
// Last-Event-ID header on any fetch-based reconnect, or switch to native
// EventSource for browser-managed replay.
let extraHeadersGetter: (() => Record<string, string>) | null = null;
export function setExtraHeadersGetter(fn: () => Record<string, string>): void {
  extraHeadersGetter = fn;
}
export function getExtraHeaders(): Record<string, string> {
  return extraHeadersGetter?.() ?? {};
}

// ----- Query keys --------------------------------------------------------

export const getListAnthropicConversationsQueryKey = () =>
  ["anthropic", "conversations"] as const;

export const getListArchivesQueryKey = () =>
  ["archives"] as const;

export const getGetAnthropicConversationQueryKey = (id: number) =>
  ["anthropic", "conversations", id] as const;

// ----- List conversations -------------------------------------------------

async function fetchConversations(archiveId?: number | null): Promise<AnthropicConversation[]> {
  const qs = archiveId ? `?archiveId=${archiveId}` : "";
  const res = await apiFetch(`/api/anthropic/conversations${qs}`);
  if (!res.ok) throw new Error(`Failed to load conversations: ${res.status}`);
  const data = await res.json();
  // Tolerate either {conversations: [...]} or [...] shape.
  return Array.isArray(data) ? data : (data?.conversations ?? []);
}

export function useListAnthropicConversations(archiveId?: number | null) {
  return useQuery<AnthropicConversation[]>({
    queryKey: [...getListAnthropicConversationsQueryKey(), archiveId ?? "all"],
    queryFn: () => fetchConversations(archiveId),
    staleTime: 5_000,
  });
}

// ----- Get one conversation ----------------------------------------------

async function fetchConversation(id: number): Promise<AnthropicConversation> {
  const res = await apiFetch(`/api/anthropic/conversations/${id}`);
  if (!res.ok) throw new Error(`Failed to load conversation ${id}: ${res.status}`);
  return res.json();
}

interface GetConversationOptions {
  query?: Partial<UseQueryOptions<AnthropicConversation>> & {
    enabled?: boolean;
    queryKey?: readonly unknown[];
  };
}

export function useGetAnthropicConversation(
  id: number,
  options: GetConversationOptions = {},
) {
  const { query: q = {} } = options;
  return useQuery<AnthropicConversation>({
    queryKey: (q.queryKey as readonly unknown[]) ?? getGetAnthropicConversationQueryKey(id),
    queryFn: () => fetchConversation(id),
    enabled: q.enabled ?? true,
    ...q,
  });
}

// ----- Create conversation -----------------------------------------------

interface CreateConversationVariables {
  data: { title: string; archiveId: number };
}

async function createConversation(vars: CreateConversationVariables): Promise<AnthropicConversation> {
  const res = await apiFetch("/api/anthropic/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars.data),
  });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  return res.json();
}

export function useCreateAnthropicConversation() {
  return useMutation({ mutationFn: createConversation });
}

// ----- Delete conversation -----------------------------------------------

interface DeleteConversationVariables {
  id: number;
}

async function deleteConversation(vars: DeleteConversationVariables): Promise<void> {
  const res = await apiFetch(`/api/anthropic/conversations/${vars.id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete conversation ${vars.id}: ${res.status}`);
}

export function useDeleteAnthropicConversation() {
  return useMutation({ mutationFn: deleteConversation });
}

async function fetchArchives(): Promise<Archive[]> {
  const res = await apiFetch("/api/archives");
  if (!res.ok) throw new Error(`Failed to load archives: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.archives ?? []);
}

export function useListArchives() {
  return useQuery<Archive[]>({
    queryKey: getListArchivesQueryKey(),
    queryFn: fetchArchives,
    staleTime: 5_000,
  });
}

interface CreateArchiveVariables {
  data: { name: string; topic: string };
}

async function createArchive(vars: CreateArchiveVariables): Promise<Archive> {
  const res = await apiFetch("/api/archives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars.data),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = typeof data?.error === "string" ? data.error : "";
    } catch {
      // ignore
    }
    const suffix = detail ? `: ${detail}` : ` (${res.status})`;
    throw new Error(`Failed to create archive${suffix}`);
  }
  return res.json();
}

export function useCreateArchive() {
  return useMutation({ mutationFn: createArchive });
}

interface GenerateResearchAnglesVariables {
  archiveId: number;
  data?: { topic?: string; committee?: string };
}

async function generateResearchAngles(vars: GenerateResearchAnglesVariables): Promise<ArchiveResearchAngles> {
  const res = await apiFetch(`/api/archives/${vars.archiveId}/research-angles/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars.data ?? {}),
  });
  if (!res.ok) throw new Error(`Failed to generate research angles (${res.status})`);
  return res.json();
}

export function useGenerateResearchAngles() {
  return useMutation({ mutationFn: generateResearchAngles });
}

interface UpdateResearchAnglesVariables {
  archiveId: number;
  data: { angles: string[] };
}

async function updateResearchAngles(vars: UpdateResearchAnglesVariables): Promise<ArchiveResearchAngles> {
  const res = await apiFetch(`/api/archives/${vars.archiveId}/research-angles`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars.data),
  });
  if (!res.ok) throw new Error(`Failed to save research angles (${res.status})`);
  return res.json();
}

export function useUpdateResearchAngles() {
  return useMutation({ mutationFn: updateResearchAngles });
}
