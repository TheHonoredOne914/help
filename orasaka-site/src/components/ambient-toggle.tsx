"use client";

import { useEffect, useState } from "react";

const KEY = "orasaka:ambient";

export function AmbientToggle() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Restore the stored UI preference after hydration; there is no SSR equivalent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaused(localStorage.getItem(KEY) === "paused");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.ambient = paused || document.hidden ? "paused" : "on";
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [paused]);

  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={() => {
        const next = !paused;
        setPaused(next);
        localStorage.setItem(KEY, next ? "paused" : "on");
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
    >
      <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
      {paused ? "Включить фоновую анимацию" : "Остановить фоновую анимацию"}
    </button>
  );
}
