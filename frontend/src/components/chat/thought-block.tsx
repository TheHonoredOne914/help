import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThoughtBlockProps {
  thinking: string;
  isThinkingFinished: boolean;
}

export function extractThinking(content: string): {
  thinking: string;
  mainContent: string;
  isThinkingFinished: boolean;
} {
  if (!content) {
    return { thinking: "", mainContent: "", isThinkingFinished: true };
  }

  const thinkStartIdx = content.indexOf("<think>");
  if (thinkStartIdx === -1) {
    // Check if the model started writing thoughts without the start tag, but let's be safe and assume standard format.
    return { thinking: "", mainContent: content, isThinkingFinished: true };
  }

  const thinkEndIdx = content.indexOf("</think>", thinkStartIdx);
  if (thinkEndIdx !== -1) {
    const thinking = content.slice(thinkStartIdx + 7, thinkEndIdx).trim();
    const mainContent = (content.slice(0, thinkStartIdx) + content.slice(thinkEndIdx + 8)).trim();
    return { thinking, mainContent, isThinkingFinished: true };
  } else {
    const thinking = content.slice(thinkStartIdx + 7).trim();
    const mainContent = content.slice(0, thinkStartIdx).trim();
    return { thinking, mainContent, isThinkingFinished: false };
  }
}

export function ThoughtBlock({ thinking, isThinkingFinished }: ThoughtBlockProps) {
  const [isOpen, setIsOpen] = useState(!isThinkingFinished);
  const [prevFinished, setPrevFinished] = useState(isThinkingFinished);

  // Auto-collapse when thinking finishes
  if (isThinkingFinished !== prevFinished) {
    setPrevFinished(isThinkingFinished);
    setIsOpen(!isThinkingFinished);
  }

  if (!thinking) return null;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-amber-500/20 dark:border-amber-500/15 bg-gradient-to-br from-amber-50/40 via-background/40 to-background dark:from-amber-950/10 dark:via-background/10 dark:to-background shadow-sm animate-in fade-in duration-300">
      
      {/* Scanning sweep shimmer when active */}
      {!isThinkingFinished && (
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(245, 158, 11, 0.05) 50%, transparent 100%)",
            animation: "thinking-shimmer 2s infinite linear",
            backgroundSize: "200% 100%"
          }}
        />
      )}

      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-amber-500/[0.03] transition-colors relative z-10"
      >
        <div className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/30">
          {!isThinkingFinished && (
            <span className="absolute inset-0 rounded-lg bg-amber-500/20 animate-ping opacity-60" style={{ animationDuration: "2s" }} />
          )}
          <Brain className={cn(
            "w-3.5 h-3.5 text-amber-600 dark:text-amber-400",
            !isThinkingFinished && "animate-pulse"
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 tracking-[0.15em] uppercase flex items-center gap-1.5">
            {isThinkingFinished ? "Reasoning Process" : "Thinking"}
            {!isThinkingFinished && (
              <span className="inline-flex gap-0.5 text-amber-500">
                <span className="animate-bounce" style={{ animationDelay: "0s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.15s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.3s" }}>.</span>
              </span>
            )}
          </span>
        </div>

        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground/60 transition-transform duration-200 shrink-0",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && (
        <div className="px-4 pb-3 pt-1 border-t border-amber-500/10 relative z-10">
          <div className="text-[11px] leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap break-words border-l border-amber-500/20 pl-3">
            {thinking}
            {!isThinkingFinished && (
              <span className="inline-block w-1 h-3.5 bg-amber-500 ml-0.5 align-middle animate-pulse" />
            )}
          </div>
        </div>
      )}

      {/* Pulse Bar at Bottom when active */}
      {!isThinkingFinished && (
        <div className="absolute bottom-0 inset-x-0 h-[2px] bg-muted/20 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-500/40 w-1/3 rounded-full" 
            style={{ 
              animation: "thinking-flow-line 1.6s infinite linear",
              backgroundSize: "200% 100%"
            }}
          />
        </div>
      )}

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
