import { useEffect, useState } from "react";
import { Activity, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const STORAGE_KEY = "ai-research:model-usage:v1";
const RESET_PERIOD_MS = 24 * 60 * 60 * 1000;

export type TrackedModel = "groq";

interface ModelMeta {
  label: string;
  short: string;
  limit: number;
  color: string;
  bg: string;
}

const MODEL_META: Record<TrackedModel, ModelMeta> = {
  groq: {
    label: "Groq (all models)",
    short: "Groq",
    limit: Infinity,
    color: "text-[#3b6fd4]",
    bg: "bg-[#3b6fd4]",
  },
};

interface UsageState {
  counts: Record<TrackedModel, number>;
  resetAt: number;
}

function emptyState(): UsageState {
  return {
    counts: { groq: 0 },
    resetAt: Date.now() + RESET_PERIOD_MS,
  };
}

function loadState(): UsageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as UsageState;
    if (!parsed.resetAt || Date.now() > parsed.resetAt) return emptyState();
    return { ...emptyState(), ...parsed, counts: { ...emptyState().counts, ...parsed.counts } };
  } catch {
    return emptyState();
  }
}

function saveState(s: UsageState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("ai-research:usage-updated"));
}

export function recordModelUse(model: TrackedModel, count = 1) {
  const s = loadState();
  s.counts[model] = (s.counts[model] ?? 0) + count;
  saveState(s);
}

export function ModelLimitsPanel() {
  const [state, setState] = useState<UsageState>(() => loadState());

  useEffect(() => {
    const onUpdate = () => setState(loadState());
    window.addEventListener("ai-research:usage-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    const interval = setInterval(() => setState(loadState()), 30_000);
    return () => {
      window.removeEventListener("ai-research:usage-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleReset = () => {
    const s = emptyState();
    saveState(s);
    setState(s);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6b6b82]">
          <Activity className="h-3 w-3" />
          Daily usage
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-[10px] text-[#4a4a5e] transition-colors hover:text-[#9a9ab0]"
          title="Reset usage counter"
          data-testid="reset-usage"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          Reset
        </button>
      </div>

      <div className="space-y-2">
        {(Object.keys(MODEL_META) as TrackedModel[]).map((m) => {
          const meta = MODEL_META[m];
          const used = state.counts[m] ?? 0;
          const isUnlimited = meta.limit === Infinity;
          const pct = isUnlimited ? Math.min(100, (used / 200) * 100) : Math.min(100, Math.round((used / meta.limit) * 100));
          const exhausted = !isUnlimited && used >= meta.limit;
          const warn = !isUnlimited && pct >= 80 && !exhausted;

          return (
            <div key={m} className="space-y-1" title={isUnlimited ? `${meta.label} - ${used} requests (unlimited)` : `${meta.label} - ${used}/${meta.limit} requests today`}>
              <div className="flex items-center justify-between text-[10px]">
                <span className={cn("max-w-[140px] truncate font-medium", meta.color)}>{meta.short}</span>
                <span className={cn("tabular-nums", exhausted ? "text-red-500 font-semibold" : warn ? "text-amber-500" : "text-[#6b6b82]")}>
                  {isUnlimited ? `${used} / unlimited` : `${used}/${meta.limit}`}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-[#1e1e26]">
                <motion.div
                  className={cn("h-full rounded-full", exhausted ? "bg-red-500" : warn ? "bg-amber-500" : meta.bg)}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-[#4a4a5e]">Unlimited - no daily cap</div>
    </div>
  );
}
