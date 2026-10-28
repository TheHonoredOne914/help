"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { TelegramUi } from "@/lib/telegram-ui";
import { TelegramLogin, type TelegramDone } from "./telegram-login";
import { useDict } from "./locale-provider";
import { Button } from "./ui";

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: { code?: string; error?: string } }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
  return { ok: res.ok, status: res.status, data };
}

const field = "mt-2 h-12 w-full rounded-[14px] border border-white/15 bg-black px-3 text-fg outline-none";

function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://") || raw.includes("\\")) return "/account";
  if (!/^\/[A-Za-z0-9/_?=&%.~-]*$/.test(raw)) return "/account";
  return raw;
}

export function LoginForm({ telegram, devMailbox, stand = false }: { telegram: TelegramUi; devMailbox: boolean; stand?: boolean }) {
  return (
    <Suspense fallback={null}>
      <LoginFields telegram={telegram} devMailbox={devMailbox} stand={stand} />
    </Suspense>
  );
}

function LoginFields({ telegram, devMailbox, stand }: { telegram: TelegramUi; devMailbox: boolean; stand: boolean }) {
  const d = useDict().login;
  const next = safeNext(useSearchParams().get("next") ?? undefined);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");
  const router = useRouter();

  async function requestCode() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await post("/api/auth/email/request", { email });
      if (!result.ok) {
        setMessage(result.status === 503 ? d.mailOff : d.mailBad);
        return;
      }
      setSent(true);
      setMessage(d.sent);
      if (devMailbox) {
        const box = await post("/api/dev/mailbox", { email });
        if (box.ok && box.data.code) setCode(box.data.code);
      }
    } catch {
      setMessage(d.net);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await post("/api/auth/email/verify", { email, code });
      if (!result.ok) {
        setMessage(d.codeBad);
        return;
      }
      // The root layout reads the session cookie. Client navigation reuses that
      // shell, so refresh it in the same turn as the route change.
      router.push(next);
      router.refresh();
    } catch {
      setMessage(d.net);
    } finally {
      setBusy(false);
    }
  }

  async function onTelegram(done: TelegramDone) {
    if (done.kind === "double") {
      const proof = await post("/api/dev/telegram-proof", { fixture: "paid" });
      if (!proof.ok) throw new Error(d.tgUnconfigured);
      const result = await post("/api/auth/telegram", proof.data);
      if (!result.ok) {
        throw new Error(result.status === 503 ? d.tgDown : d.tgFail);
      }
    } else if (done.kind === "oidc") {
      const result = await post("/api/auth/telegram/oidc", { id_token: done.idToken });
      if (!result.ok) {
        throw new Error(result.status === 503 ? d.tgDown : d.tgFail);
      }
    } else {
      const result = await post("/api/auth/telegram", done.fields);
      if (!result.ok) {
        throw new Error(result.status === 503 ? d.tgDown : d.tgFail);
      }
    }
    router.push(next);
    router.refresh();
  }

  const telegramLead = stand ? d.tgStand : telegram.kind === "double" ? d.tgDouble : telegram.kind === "off" ? d.tgOff : d.tgId;

  return (
    <div className="mx-auto w-full max-w-[404px] rounded-[20px] border border-white/10 bg-white/[0.03] p-8">
      <p className="text-center font-mono text-sm font-bold tracking-wide">{d.brand}</p>
      <div className="mt-5 grid grid-cols-2 gap-2" role="tablist" aria-label={d.tabs}>
        {(["login", "register"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`min-h-12 rounded-[14px] font-mono text-sm font-bold ${tab === id ? "bg-[linear-gradient(135deg,#e5231b,#8c0f0f,#ff4433)] text-white" : "border border-white/14 text-muted"}`}
            onClick={() => setTab(id)}
          >
            {id === "login" ? d.login : d.register}
          </button>
        ))}
      </div>
      <h1 className="mt-6 text-center font-mono text-xl font-extrabold">{tab === "login" ? d.title : d.registerTitle}</h1>
      <p className="mt-2 text-center text-sm text-muted">{d.lead}</p>
      <label className="mt-5 block text-sm" htmlFor="login-email">
        {d.email}
        <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={field} />
      </label>
      {sent ? (
        <label className="mt-4 block text-sm" htmlFor="login-code">
          {d.code}
          <input id="login-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} className={field} />
        </label>
      ) : null}
      <Button className="mt-5 w-full" disabled={busy || !email || (sent && code.length < 6)} onClick={() => void (sent ? verify() : requestCode())}>
        {sent ? d.confirm : d.continue}
      </Button>
      {sent ? (
        <button type="button" className="mt-3 w-full text-center text-sm text-muted underline" disabled={busy} onClick={() => void requestCode()}>
          {d.resend}
        </button>
      ) : null}
      {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
      <p className="my-5 text-center text-xs uppercase tracking-[0.2em] text-muted">{d.or}</p>
      <p className="text-sm text-muted">{telegramLead}</p>
      <div className="mt-4">
        <TelegramLogin mode={telegram} label={stand ? d.tgStandButton : d.tgButton} onDone={onTelegram} />
      </div>
      <p className="mt-5 text-center text-xs text-muted">
        <Link href="/legal/privacy" className="underline">{d.privacy}</Link>
        {" · "}
        <Link href="/legal/offer" className="underline">{d.offer}</Link>
      </p>
    </div>
  );
}
