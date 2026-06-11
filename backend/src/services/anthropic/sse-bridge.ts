import type { Response } from "express";
import { redactSecretsDeep } from "../../core/security/secret-redaction.js";

export interface AnthropicSseLogger {
  warn?: (payload: unknown, message?: string) => void;
}

export function writeAnthropicSseEvent(
  res: Response,
  requestId: string,
  data: Record<string, unknown>,
  logger?: AnthropicSseLogger,
): void {
  if (res.writableEnded || res.destroyed) return;
  let serialized: string;
  try {
    serialized = JSON.stringify(redactSecretsDeep({ requestId, ...data }));
  } catch (err) {
    logger?.warn?.({ requestId, err }, "[sse] Failed to serialize event - skipping");
    return;
  }
  try {
    res.write(`data: ${serialized}\n\n`);
  } catch {
    // Client already disconnected.
  }
}
