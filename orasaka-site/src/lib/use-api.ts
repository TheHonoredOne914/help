"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as z from "zod/mini";
import type { ApiErrorCode, DataSource } from "@/lib/api/types";
import { fetchJson } from "./fetch-json";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiErrorCode }
  | { status: "ready"; data: T; source: DataSource };

/**
 * GET a BFF resource with loading/error/ready states; `reload` refetches, `silent` keeps current
 * data visible. `initial` (already resolved on the server) skips the first request.
 */
export function useApi<S extends z.ZodMiniType>(
  path: string | null,
  schema: S,
  initial?: { data: z.infer<S>; source: DataSource },
) {
  const [state, setState] = useState<ApiState<z.infer<S>>>(initial ? { status: "ready", ...initial } : { status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const skipFirst = useRef(Boolean(initial));

  useEffect(() => {
    if (!path) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const ctrl = new AbortController();
    fetchJson(path, schema, { signal: ctrl.signal })
      .then((res) =>
        setState(res.ok ? { status: "ready", data: res.data, source: res.source } : { status: "error", error: res.error }),
      )
      .catch(() => {});
    return () => ctrl.abort();
  }, [path, schema, attempt]);

  const reload = useCallback((opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setState({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);

  return { state, setState, reload };
}
