"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TelegramUi } from "@/lib/telegram-ui";
import { TelegramLogin, type TelegramDone } from "./telegram-login";
import { Button } from "./ui";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string; message?: string };
  return { ok: res.ok, status: res.status, data };
}

const field = "mt-2 w-full rounded-md border border-line bg-bg px-3 py-3 text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={() => {
        void post("/api/auth/logout").then(() => {
          router.push("/login");
          router.refresh();
        });
      }}
    >
      Выйти
    </Button>
  );
}

export function LinkEmailForm({ devMailbox }: { devMailbox: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          try {
            if (!sent) {
              const result = await post("/api/auth/email/request", { email });
              if (!result.ok) {
                setMessage(result.status === 503 ? "Почта на этом сервере не настроена." : "Проверьте адрес почты.");
                return;
              }
              setSent(true);
              if (devMailbox) {
                const box = await post("/api/dev/mailbox", { email });
                if (box.ok && box.data.code) setCode(box.data.code);
              }
              setMessage("Введите код из письма.");
              return;
            }
            const result = await post("/api/account/link-email", { email, code });
            if (result.status === 409) {
              setMessage(result.data.message ?? "Этот email уже привязан к другому аккаунту. Напишите в поддержку.");
              return;
            }
            if (!result.ok) {
              setMessage("Код не подошёл.");
              return;
            }
            router.refresh();
          } catch {
            setMessage("Не удалось отправить запрос. Повторите попытку.");
          }
        })();
      }}
    >
      <label className="block text-sm font-medium" htmlFor="link-email">
        Привязать email
        <input id="link-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={field} />
      </label>
      {sent ? (
        <label className="block text-sm font-medium" htmlFor="link-code">
          Код
          <input id="link-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} className={field} />
        </label>
      ) : null}
      <Button type="submit">{sent ? "Подтвердить email" : "Получить код"}</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}

export function LinkTelegramButton({ mode }: { mode: TelegramUi }) {
  const router = useRouter();
  if (mode.kind === "off") return <p className="mt-4 text-sm text-muted">Привязка Telegram не подключена</p>;

  async function onDone(done: TelegramDone) {
    if (done.kind === "double") {
      const proof = await post("/api/dev/telegram-proof", { purpose: "link" });
      if (!proof.ok) throw new Error("Привязка Telegram не подключена");
      const result = await post("/api/account/link-telegram", proof.data);
      if (!result.ok) throw new Error(linkError(result.status, result.data.message));
    } else if (done.kind === "oidc") {
      const result = await post("/api/auth/telegram/oidc", { id_token: done.idToken });
      if (!result.ok) throw new Error(linkError(result.status, result.data.message));
    } else {
      const result = await post("/api/account/link-telegram", done.fields);
      if (!result.ok) throw new Error(linkError(result.status, result.data.message));
    }
    router.refresh();
  }

  return (
    <div className="mt-4">
      <TelegramLogin mode={mode} label="Подтвердить Telegram" onDone={onDone} />
    </div>
  );
}

function linkError(status: number, message?: string): string {
  if (status === 409) return message ?? "Этот Telegram уже привязан к другому аккаунту. Напишите в поддержку.";
  if (status === 503) return "Сервис подписки временно недоступен. Повторите попытку.";
  return "Не удалось подтвердить Telegram.";
}
