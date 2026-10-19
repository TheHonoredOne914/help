"use client";

import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import type { ApiErrorCode } from "@/lib/api/types";
import { fetchJson } from "./fetch-json";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiErrorCode }
  | { status: "ready"; data: T };

/** GET a BFF resource with loading/error/ready states; `reload` refetches, `silent` keeps current data visible. */
export function useApi<S extends z.ZodType>(path: string | null, schema: S) {
  const [state, setState] = useState<ApiState<z.infer<S>>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    fetchJson(path, schema, { signal: ctrl.signal })
      .then((res) => setState(res.ok ? { status: "ready", data: res.data } : { status: "error", error: res.error }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [path, schema, attempt]);

  const reload = useCallback((opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setState({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);

  return { state, setState, reload };
}
