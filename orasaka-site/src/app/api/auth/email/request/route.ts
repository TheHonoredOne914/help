import { NextResponse, type NextRequest } from "next/server";
import { sendSmtp } from "@/lib/mail/smtp";
import { isSameOrigin, jsonError, readJson } from "@/lib/server/bff";
import { clientIp } from "@/lib/server/client-ip";
import { getStore } from "@/lib/server/db";
import { envGet } from "@/lib/server/env-get";
import { getServerEnv } from "@/lib/server/env";
import { siteProfile } from "@/lib/server/profile";
import { forgetChallenge, normalizeEmail, requestEmail } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (getServerEnv().siteMode !== "public") return jsonError("not_found");
  if (!isSameOrigin(request)) return jsonError("forbidden");
  const body = (await readJson(request)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const smtpReady = Boolean(envGet("SMTP_HOST") && envGet("SMTP_FROM"));
  const devMail = siteProfile() === "isolated" && envGet("MAIL_MODE") === "dev";
  const mode = devMail ? "dev" : envGet("MAIL_MODE") === "smtp" && smtpReady ? "smtp" : "off";
  const result = requestEmail(getStore(), {
    email,
    ip: clientIp({
      trustProxy: envGet("TRUST_PROXY") === "1",
      forwardedFor: request.headers.get("x-forwarded-for"),
      peerAddress: null,
    }),
    now: Date.now(),
    secret: envGet("ORASAKA_CODE_SECRET") ?? "",
    mode,
  });
  if (!result.ok && result.error === "invalid_email") return jsonError("bad_request");
  if (!result.ok) {
    return NextResponse.json({ error: "mail_unconfigured" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  if (result.delivered && mode === "smtp" && result.code && result.challengeId) {
    const to = normalizeEmail(email);
    try {
      if (!to) throw new Error("email");
      const port = Number(envGet("SMTP_PORT") ?? 587);
      await sendSmtp({
        host: envGet("SMTP_HOST") ?? "",
        port,
        secure: envGet("SMTP_SECURE") === "1" || port === 465,
        user: envGet("SMTP_USER"),
        pass: envGet("SMTP_PASS"),
        from: envGet("SMTP_FROM") ?? "",
        to,
        subject: "Код входа ORASAKA",
        text: `Код для входа: ${result.code}\n`,
      });
    } catch {
      forgetChallenge(getStore(), result.challengeId);
      return NextResponse.json({ error: "mail_unconfigured" }, { status: 503, headers: { "cache-control": "private, no-store" } });
    }
  }
  return NextResponse.json({ accepted: true }, { headers: { "cache-control": "private, no-store" } });
}
