"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatExpiry } from "@/lib/cabinet-copy";
import { fill } from "@/lib/i18n/locale";
import { useDict, useLocale } from "./locale-provider";
import { ConfirmDialog } from "./confirm-dialog";
import { Button } from "./ui";

type Device = { id: string; label: string; lastActiveAt: string | null; online: boolean | null };
type Online = "known" | "unknown" | "unavailable" | "unconfigured";

function activity(device: Device, online: Online, locale: ReturnType<typeof useLocale>, c: ReturnType<typeof useDict>["cabinet"]): string {
  const when = device.lastActiveAt ? formatExpiry(device.lastActiveAt, locale) : null;
  if (!when) return c.registered;
  if (online !== "known" || device.online === null) return fill(c.last, { when });
  return device.online ? fill(c.onlineNow, { when }) : fill(c.offline, { when });
}

export function DeviceList({
  devices,
  devicesError,
  online,
  deviceLimit,
  canRevoke,
}: {
  devices: Device[] | null;
  devicesError: boolean;
  online: Online;
  deviceLimit: number | null;
  canRevoke: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const c = useDict().cabinet;
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (online === "unconfigured" && !devicesError) {
    return (
      <>
        <p className="mt-3 text-sm text-muted">{c.devicesDown}</p>
        <p className="mt-2 text-sm text-muted">{c.online}</p>
      </>
    );
  }
  if (devicesError || !devices) {
    return (
      <>
        <p className="mt-3 text-sm text-muted">{c.devicesTemp}</p>
        <p className="mt-2 text-sm text-muted">{c.online}</p>
        <a className="mt-3 inline-block text-sm text-fg underline" href="/account/devices">
          {c.retry}
        </a>
      </>
    );
  }
  return (
    <>
      {devices.length === 0 ? <p className="mt-3 text-sm text-muted">{c.noneDevices}</p> : <p className="mt-3 text-sm">{fill(c.registeredCount, { n: devices.length })}</p>}
      <p className="mt-2 text-sm text-muted">{deviceLimit === null ? c.limitNone : fill(c.limit, { n: deviceLimit })}</p>
      {online === "unknown" || online === "unavailable" ? <p className="mt-2 text-sm text-muted">{c.online}</p> : null}
      <ul className="mt-4 space-y-4">
        {devices.map((device) => (
          <li key={device.id} className="border-t border-line pt-4 text-sm">
            <p className="font-medium">{device.label}</p>
            <p className="mt-1 text-muted">{activity(device, online, locale, c)}</p>
            {canRevoke ? (
              <Button variant="secondary" className="mt-3" onClick={() => setPending(device.id)}>
                {c.revoke}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      <ConfirmDialog
        open={pending !== null}
        title={c.revokeTitle}
        description={c.revokeBody}
        confirmLabel={c.revoke}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const id = pending;
          setPending(null);
          if (!id) return;
          void fetch(`/api/account/devices/${encodeURIComponent(id)}/revoke`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          }).then(async (res) => {
            if (!res.ok) {
              setMessage(c.revokeFail);
              return;
            }
            router.refresh();
          });
        }}
      />
    </>
  );
}
