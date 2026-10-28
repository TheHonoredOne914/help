"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/*
 * Canvas and the custom cursor are decoration. dynamic() only splits the chunks; it does not by
 * itself wait. These components mount from an idle callback after the first paint, so their bytes
 * are not in the first wave with the hero. If a chunk fails to load, the import resolves to nothing:
 * the static background and the system cursor stay. The canvas fades in once its first frame is
 * ready. The system cursor is hidden only after the custom one has opened — see cyber-cursor.tsx.
 */
function Quiet() {
  return null;
}

const CyberBackground = dynamic(
  () => import("./cyber-background").then((m) => m.CyberBackground).catch(() => Quiet),
  { ssr: false },
);
const CyberCursor = dynamic(
  () => import("./cyber-cursor").then((m) => m.CyberCursor).catch(() => Quiet),
  { ssr: false },
);

function useAfterFirstPaint() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let idle = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => setOn(true);
    const start = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(go, { timeout: 800 });
      else timer = setTimeout(go, 200);
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(start));
    return () => {
      cancelAnimationFrame(raf);
      if (idle) window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return on;
}

export function DeferredBackground() {
  const on = useAfterFirstPaint();
  return (
    <>
      <div aria-hidden="true" className="fx-static" />
      <div aria-hidden="true" className="screen-grain" />
      {on ? <CyberBackground /> : null}
    </>
  );
}

export function DeferredCursor() {
  const on = useAfterFirstPaint();
  return on ? <CyberCursor /> : null;
}
