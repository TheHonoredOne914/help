import type { Response } from "express";
import { redactSecretsDeep } from "../security/secret-redaction.js";
import { TerminalWriteGuard } from "./run-stream/terminal-write-guard.js";

const guards = new WeakMap<Response, TerminalWriteGuard>();

export function writeSse(res: Response, payload: unknown): void {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const guard = guards.get(res) ?? new TerminalWriteGuard();
  guards.set(res, guard);
  if (!guard.canWrite(record)) return;
  res.write(`data: ${JSON.stringify(redactSecretsDeep(payload))}\n\n`);
}
