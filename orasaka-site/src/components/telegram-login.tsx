"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramUi } from "@/lib/telegram-ui";
import { Button } from "./ui";

export type TelegramDone =
  | { kind: "double" }
  | { kind: "oidc"; idToken: string }
  | { kind: "widget"; fields: Record<string, string> };

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: { client_id: number; nonce: string; scope: string[]; lang: string },
          callback: (data: { id_token?: string; error?: string }) => void,
        ) => void;
      };
    };
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

const OIDC_SRC = "https://oauth.telegram.org/js/telegram-login.js?3";
const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { nonce?: string };
  return { ok: res.ok, data };
}

function loadScript(src: string): Promise<void> {
  const found = document.querySelector(`script[src="${src}"]`);
  if (found?.getAttribute("data-loaded") === "1") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute("data-loaded", "1");
      resolve();
    };
    script.onerror = () => reject(new Error("script"));
    document.head.appendChild(script);
  });
}

/** Official browser login. kind "off" never calls the dev fixture. */
export function TelegramLogin({
  mode,
  label,
  onDone,
}: {
  mode: TelegramUi;
  label: string;
  onDone: (done: TelegramDone) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (mode.kind !== "widget") return;
    const box = host.current;
    if (!box) return;
    let cancel = false;
    window.onTelegramAuth = (user) => {
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(user)) {
        if (typeof value === "string" || typeof value === "number") fields[key] = String(value);
      }
      void onDoneRef.current({ kind: "widget", fields }).catch((error: unknown) => {
        setNote(error instanceof Error ? error.message : "Не удалось подтвердить вход через Telegram.");
      });
    };
    void (async () => {
      try {
        const attempt = await postJson("/api/auth/telegram/attempt", {});
        if (cancel) return;
        if (!attempt.ok) {
          setNote("Вход через Telegram не подключён");
          return;
        }
        const script = document.createElement("script");
        script.async = true;
        script.src = WIDGET_SRC;
        script.setAttribute("data-telegram-login", mode.botUsername);
        script.setAttribute("data-size", "large");
        script.setAttribute("data-onauth", "onTelegramAuth(user)");
        script.setAttribute("data-request-access", "write");
        box.replaceChildren(script);
      } catch {
        if (!cancel) setNote("Вход через Telegram не подключён");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [mode]);

  if (mode.kind === "off") {
    return (
      <Button variant="secondary" disabled>
        Вход через Telegram не подключён
      </Button>
    );
  }

  if (mode.kind === "widget") {
    return (
      <div>
        <div ref={host} />
        {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setNote(null);
            try {
              if (mode.kind === "double") {
                await onDone({ kind: "double" });
                return;
              }
              const attempt = await postJson("/api/auth/telegram/attempt", {});
              const nonce = attempt.data.nonce ?? "";
              const clientId = Number(mode.clientId);
              if (!attempt.ok || !nonce || !Number.isSafeInteger(clientId)) {
                setNote("Вход через Telegram не подключён");
                return;
              }
              await loadScript(OIDC_SRC);
              const idToken = await new Promise<string>((resolve, reject) => {
                const auth = window.Telegram?.Login?.auth;
                if (!auth) {
                  reject(new Error("Вход через Telegram не подключён"));
                  return;
                }
                let done = false;
                const finish = (fn: () => void) => {
                  if (done) return;
                  done = true;
                  window.removeEventListener("focus", onFocus);
                  fn();
                };
                const onFocus = () => finish(() => reject(new Error("Вход отменён.")));
                auth({ client_id: clientId, nonce, scope: ["profile"], lang: "ru" }, (data) => {
                  const token = data.id_token;
                  if (token) finish(() => resolve(token));
                  else finish(() => reject(new Error("Не удалось подтвердить вход через Telegram.")));
                });
                window.setTimeout(() => window.addEventListener("focus", onFocus), 700);
              });
              await onDone({ kind: "oidc", idToken });
            } catch (error) {
              setNote(error instanceof Error ? error.message : "Не удалось подтвердить вход через Telegram.");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {label}
      </Button>
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
