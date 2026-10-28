"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyAmbientAttribute, isAmbientPaused, setAmbientPaused, subscribeAmbient } from "@/lib/fx/ambient-pref";
import { useDict } from "./locale-provider";

export function AmbientToggle() {
  const paused = useSyncExternalStore(subscribeAmbient, isAmbientPaused, () => false);
  const label = useDict().anim;

  useEffect(() => {
    applyAmbientAttribute();
    document.addEventListener("visibilitychange", applyAmbientAttribute);
    return () => document.removeEventListener("visibilitychange", applyAmbientAttribute);
  }, [paused]);

  return (
    <button
      type="button"
      aria-pressed={paused}
      data-testid="ambient-toggle"
      onClick={() => setAmbientPaused(!paused)}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
    >
      <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
      {paused ? label.play : label.stop}
    </button>
  );
}
