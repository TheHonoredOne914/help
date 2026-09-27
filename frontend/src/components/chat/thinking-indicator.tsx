import { Brain, Loader2 } from "lucide-react";

export type ThinkingPhase = "connecting" | "verifying";

interface ThinkingIndicatorProps {
  mode: "normal" | "rhetorics" | string;
  rhetoricsType?: "kavita" | "speech" | "debate" | null;
  /**
   * Real backend-driven state. No timers, no rotating fake phases:
   * - "connecting": stream open, no content bytes yet.
   * - "verifying": backend sent { verifying: true } (substantive factual reply).
   */
  phase?: ThinkingPhase;
  /** Optional honest detail, e.g. verifier name or tok/s. Rendered verbatim. */
  detail?: string | null;
}

function titleFor(mode: string, rhetoricsType: ThinkingIndicatorProps["rhetoricsType"], phase: ThinkingPhase): string {
  if (phase === "verifying") return "Verifying claims";
  if (mode === "rhetorics") {
    if (rhetoricsType === "kavita") return "Composing Kavita";
    if (rhetoricsType === "debate") return "Formulating Rebuttal";
    return "Structuring Speech";
  }
  return "Drafting Intervention";
}

function subtitleFor(phase: ThinkingPhase, detail?: string | null): string {
  if (detail) return detail;
  return phase === "verifying"
    ? "Checking factual claims…"
    : "Contacting model…";
}

export function ThinkingIndicator({ mode, rhetoricsType, phase = "connecting", detail = null }: ThinkingIndicatorProps) {
  return (
    <div className="flex flex-col gap-2.5 w-full max-w-[480px]">
      <div className="relative overflow-hidden rounded-lg border border-[var(--navy)]/20 bg-gradient-to-br from-[var(--navy)]/5 via-background/40 to-background p-4 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] animate-in fade-in duration-300">

        {/* Animated Sweep Shimmer */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.06) 50%, transparent 100%)",
            animation: "thinking-shimmer 2s infinite linear",
            backgroundSize: "200% 100%"
          }}
        />

        <div className="flex items-center gap-3 relative z-10">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--navy)_12%,transparent)] border border-[color-mix(in_srgb,var(--navy)_20%,transparent)]">
            <span className="absolute inset-0 rounded-xl bg-[var(--navy)]/20 animate-ping opacity-60" style={{ animationDuration: "2.5s" }} />
            <Brain className="w-4.5 h-4.5 text-[var(--navy)] animate-pulse" />
          </div>

          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-bold text-[var(--navy)] tracking-[0.1em] uppercase">
                {titleFor(mode, rhetoricsType, phase)}
              </span>
              <span className="inline-flex gap-0.5 text-xs text-[var(--navy)]/70" aria-hidden>
                <span className="animate-bounce" style={{ animationDelay: "0s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.15s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.3s" }}>.</span>
              </span>
            </div>

            <div className="min-h-4">
              <span className="block text-xs text-[var(--slate)] truncate font-mono">
                {subtitleFor(phase, detail)}
              </span>
            </div>
          </div>

          <div className="relative w-4 h-4 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-[var(--brass)] animate-spin shrink-0" />
          </div>
        </div>

        {/* Pulse Bar at Bottom */}
        <div className="absolute bottom-0 inset-x-0 h-[2px] bg-[var(--surface-muted)]/40 overflow-hidden">
          <div
            className="h-full bg-[var(--navy)]/50 w-1/3 rounded-sm"
            style={{
              animation: "thinking-flow-line 1.6s infinite linear",
              backgroundSize: "200% 100%"
            }}
          />
        </div>
      </div>

      {/* Inline styles for custom animations to keep component self-contained and clean */}
      <style>{`
        @keyframes thinking-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes thinking-flow-line {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
