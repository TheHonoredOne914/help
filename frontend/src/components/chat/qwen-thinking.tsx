import { useEffect, useRef } from "react";
import { Brain, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface QwenThinkingProps {
  modelLabel: string;
  thinkingStream: string;
  thinkingSteps: string[];
  isActive: boolean;
}

const PLACEHOLDER_STEPS = [
  "Parsing the AI-generated response...",
  "Loading retrieved web sources...",
  "Cross-referencing factual claims...",
];

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

  const steps = thinkingSteps.length > 0 ? thinkingSteps : PLACEHOLDER_STEPS;

  return (
    <div className="qwen-thinking-card relative overflow-hidden rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-yellow-50/60 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-950/20 p-3 animate-in fade-in slide-in-from-top-1 duration-300">
      {/* Animated scanning sweep */}
      {isActive && <div className="qwen-sweep pointer-events-none absolute inset-0" aria-hidden />}

      <div className="relative flex items-center gap-2 mb-2">
        <div className="relative flex items-center justify-center w-6 h-6">
          <span className="absolute inset-0 rounded-full bg-amber-400/30 qwen-pulse-ring" />
          <span className="absolute inset-0 rounded-full bg-amber-400/20 qwen-pulse-ring" style={{ animationDelay: "0.6s" }} />
          <Brain className="relative w-4 h-4 text-amber-600 dark:text-amber-400 qwen-brain-bob" />
        </div>
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
          <span>{modelLabel} is thinking</span>
          <span className="qwen-thinking-dots inline-flex gap-0.5">
            <span className="qwen-dot">.</span>
            <span className="qwen-dot">.</span>
            <span className="qwen-dot">.</span>
          </span>
        </span>
        <Sparkles className="ml-auto w-3 h-3 text-amber-500/70 qwen-sparkle" />
      </div>

      {thinkingStream ? (
        <div
          ref={streamRef}
          className="relative max-h-44 overflow-y-auto bg-white/60 dark:bg-black/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg p-2.5 text-[11px] leading-relaxed font-mono text-foreground/90 whitespace-pre-wrap"
        >
          <span className="qwen-stream-text">{thinkingStream}</span>
          {isActive && (
            <span className="inline-block w-1.5 h-3 bg-amber-500 ml-0.5 align-middle animate-pulse" />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 pl-1">
          {steps.map((step, i) => (
            <div
              key={`${i}-${step}`}
              className={cn(
                "flex items-center gap-2 text-[11px] text-amber-900/80 dark:text-amber-100/80",
                "qwen-step-in",
              )}
              style={{ animationDelay: `${i * 140}ms` }}
            >
              <span className="relative flex items-center justify-center w-2 h-2 shrink-0">
                <span className="absolute inset-0 rounded-full bg-amber-400/60 qwen-step-ping" style={{ animationDelay: `${i * 140}ms` }} />
                <span className="relative w-1.5 h-1.5 rounded-full bg-amber-500" />
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
