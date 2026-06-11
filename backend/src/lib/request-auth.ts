import type { Request } from "express";

export const LOCAL_DEV_USER_ID = "local-dev-user";

declare global {
  namespace Express {
    interface Request {
      authUserId?: string;
      authUserEmail?: string;
      authProvider?: "supabase" | "internal" | "local-dev";
    }
  }
}

export function getRequestOwnerId(req: Request): string {
  return req.authUserId ?? LOCAL_DEV_USER_ID;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
