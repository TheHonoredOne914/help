import type { z } from "zod";
import type { ApiErrorCode, ApiResult } from "@/lib/api/types";

const KNOWN: ApiErrorCode[] = [
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "timeout",
  "unavailable",
  "bad_request",
  "bad_response",
  "payments_disabled",
  "backend_not_configured",
  "contract_unverified",
];

/** Browser → same-origin BFF only. Validates the response shape at the boundary. */
export async function fetchJson<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<ApiResult<z.infer<S>>> {
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
      return { ok: false, error: code && KNOWN.includes(code) ? code : "unavailable" };
    }
    const parsed = schema.safeParse(body);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "bad_response" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError" && signal?.aborted) throw err;
    return { ok: false, error: err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "unavailable" };
  }
}
