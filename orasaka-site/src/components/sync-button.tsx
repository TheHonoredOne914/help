"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export function SyncButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void fetch("/api/account/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
            .then(async (res) => {
              const data = (await res.json().catch(() => ({}))) as { linked?: boolean; error?: string };
              if (res.status === 409) {
                setMessage("Этот вход уже связан с другим кабинетом. Напишите в поддержку. Подписки не объединяются.");
                return;
              }
              if (!res.ok) {
                setMessage("Синхронизация временно недоступна. Повторите попытку.");
                return;
              }
              setMessage(data.linked ? "Подписка привязана к этому кабинету." : "Подписка по этому входу не найдена.");
              router.refresh();
            })
            .catch(() => setMessage("Синхронизация временно недоступна. Повторите попытку."))
            .finally(() => setBusy(false));
        }}
      >
        Синхронизировать подписку
      </Button>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
