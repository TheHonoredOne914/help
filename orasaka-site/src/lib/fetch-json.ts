import type { z } from "zod";
import { API_ERROR_CODES, SOURCE_HEADER, type ApiErrorCode, type DataSource } from "@/lib/api/types";

export type FetchResult<T> = { ok: true; data: T; source: DataSource } | { ok: false; error: ApiErrorCode };

/** Browser → same-origin BFF only. Validates the response shape at the boundary. */
export async function fetchJson<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<FetchResult<z.infer<S>>> {
  const { timeoutMs = 10_000, signal, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(path, {
      ...rest,
      cache: "no-store",
      credentials: "same-origin",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body as { error?: string } | null)?.error as ApiErrorCode | undefined;
      return { ok: false, error: code && API_ERROR_CODES.includes(code) ? code : "unavailable" };
    }
    const parsed = schema.safeParse(body);
    const source: DataSource = res.headers.get(SOURCE_HEADER) === "live" ? "live" : "mock";
    return parsed.success ? { ok: true, data: parsed.data, source } : { ok: false, error: "bad_response" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError" && signal?.aborted) throw err;
    return { ok: false, error: err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "unavailable" };
  }
}

export function postJson<S extends z.ZodType>(path: string, schema: S, body: unknown, headers: Record<string, string> = {}) {
  return fetchJson(path, schema, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
