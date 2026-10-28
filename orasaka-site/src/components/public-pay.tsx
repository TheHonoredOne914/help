"use client";

import { useState } from "react";
import { useDict } from "./locale-provider";
import { Button } from "./ui";

export function PublicPay({ planId, yookassa, cryptopay }: { planId: string; yookassa: boolean; cryptopay: boolean; cryptoOn?: boolean }) {
  const d = useDict().checkout;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const start = (method: "yookassa" | "cryptopay") => {
    setBusy(method);
    setMessage(null);
    void fetch("/api/public/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId, method, idempotencyKey: crypto.randomUUID() }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { checkoutUrl?: string | null; orderId?: string };
        if (!res.ok || !data.orderId) {
          setMessage(d.fail);
          return;
        }
        setOrderId(data.orderId);
        setCheckoutUrl(data.checkoutUrl ?? null);
        if (!data.checkoutUrl) setMessage(d.creating);
      })
      .catch(() => setMessage(d.fail))
      .finally(() => setBusy(null));
  };

  return (
    <div className="mt-6 space-y-3">
      {yookassa ? (
        <Button size="header" disabled={busy !== null} onClick={() => start("yookassa")}>
          {d.yoo}
        </Button>
      ) : null}
      {cryptopay ? (
        <div>
          <Button size="header" disabled={busy !== null} onClick={() => start("cryptopay")}>
            {d.payUsdt}
          </Button>
          <p className="mt-2 text-sm text-muted">{d.usdtNote}</p>
          {checkoutUrl ? <p className="mt-1 text-sm text-muted">{d.qrNote}</p> : null}
        </div>
      ) : null}
      {checkoutUrl ? (
        <a className="block break-all text-sm text-fg underline" href={checkoutUrl}>
          {d.openPay}
        </a>
      ) : null}
      {orderId ? (
        <a className="block text-sm text-fg underline" href={`/checkout/${orderId}`}>
          {d.check}
        </a>
      ) : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
