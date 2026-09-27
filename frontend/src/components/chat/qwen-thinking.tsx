import { useEffect, useRef } from "react";
import { Brain, Loader2 } from "lucide-react";

interface QwenThinkingProps {
  modelLabel: string;
  thinkingStream: string;
  thinkingSteps: string[];
  isActive: boolean;
}

export function QwenThinking({
  modelLabel,
  thinkingStream,
  thinkingSteps,
  isActive,
}: QwenThinkingProps) {
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [thinkingStream]);

  const hasRealOutput = thinkingStream.trim().length > 0 || thinkingSteps.length > 0;

  return (
    <div className="qwen-thinking-card relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--navy)_25%,transparent)] bg-[color-mix(in_srgb,var(--navy)_6%,transparent)] p-3 animate-in fade-in duration-300">
      {/* Animated scanning sweep */}
      {isActive && <div className="qwen-sweep pointer-events-none absolute inset-0" aria-hidden />}

      <div className="relative flex items-center gap-2 mb-2">
        <div className="relative flex items-center justify-center w-6 h-6">
          <span className="absolute inset-0 rounded-full bg-[var(--navy)]/25 qwen-pulse-ring" />
          <span className="absolute inset-0 rounded-full bg-[var(--navy)]/15 qwen-pulse-ring" style={{ animationDelay: "0.6s" }} />
          <Brain className="relative w-4 h-4 text-[var(--navy)] qwen-brain-bob" />
        </div>
        <span className="text-xs font-semibold text-[var(--navy)] flex items-center gap-1.5">
          <span>{modelLabel} is thinking</span>
          <span className="qwen-thinking-dots inline-flex gap-0.5">
            <span className="qwen-dot">.</span>
            <span className="qwen-dot">.</span>
            <span className="qwen-dot">.</span>
          </span>
        </span>
        <Loader2 className="ml-auto w-3 h-3 text-[var(--brass)] animate-spin" />
      </div>

      {thinkingStream ? (
        <div
          ref={streamRef}
          className="relative max-h-44 overflow-y-auto bg-[var(--surface)] border border-[color-mix(in_srgb,var(--navy)_30%,transparent)] rounded-lg p-2.5 text-xs leading-relaxed font-mono text-[var(--ink)]/90 whitespace-pre-wrap"
        >
          <span className="qwen-stream-text">{thinkingStream}</span>
          {isActive && (
            <span className="inline-block w-1.5 h-3 bg-[var(--navy)] ml-0.5 align-middle animate-pulse" />
          )}
        </div>
      ) : hasRealOutput ? (
        <div className="flex flex-col gap-1.5 pl-1">
          {thinkingSteps.map((step, i) => (
            <div
              key={`${i}-${step}`}
              className="flex items-center gap-2 text-xs text-[var(--slate)] qwen-step-in"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              <span className="relative flex items-center justify-center w-2 h-2 shrink-0">
                <span className="absolute inset-0 rounded-full bg-[var(--navy)]/60 qwen-step-ping" style={{ animationDelay: `${i * 140}ms` }} />
                <span className="relative w-1.5 h-1.5 rounded-full bg-[var(--navy)]" />
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      ) : (
        // Honest idle state: backend hasn't emitted verification output yet.
        // Never invent fake "parsing / loading / cross-referencing" steps.
        <div className="flex items-center gap-2 pl-1 text-xs text-[var(--slate)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{isActive ? "Waiting for verification output…" : "Verification produced no output."}</span>
        </div>
      )}
    </div>
  );
}
