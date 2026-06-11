import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Sparkles, Sparkle } from "lucide-react";

interface ThinkingIndicatorProps {
  mode: "normal" | "rhetorics" | string;
  rhetoricsType?: "kavita" | "speech" | "debate" | null;
}

const DRAFTING_PHASES = [
  "Consulting committee archive memory...",
  "Analyzing debate context and keywords...",
  "Structuring diplomatic arguments...",
  "Aligning with sovereign policy stances...",
  "Polishing drafting style...",
];

const KAVITA_PHASES = [
  "Absorbing committee emotions...",
  "Rhyming structural verses...",
  "Weaving Indian metaphors...",
  "Polishing poetic meters...",
  "Refining artistic balance...",
];

const SPEECH_PHASES = [
  "Opening speech structures...",
  "Structuring delegate interventions...",
  "Validating floor arguments...",
  "Polishing dramatic delivery...",
];

const DEBATE_PHASES = [
  "Scanning delegate statements...",
  "Synthesizing counter-arguments...",
  "Finding logical fallacies...",
  "Drafting floor rebuttals...",
];

export function ThinkingIndicator({ mode, rhetoricsType }: ThinkingIndicatorProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  let phases = DRAFTING_PHASES;
  if (mode === "rhetorics") {
    if (rhetoricsType === "kavita") phases = KAVITA_PHASES;
    else if (rhetoricsType === "speech") phases = SPEECH_PHASES;
    else if (rhetoricsType === "debate") phases = DEBATE_PHASES;
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % phases.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phases]);

  return (
    <div className="flex flex-col gap-2.5 w-full max-w-[480px]">
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 dark:border-blue-500/15 bg-gradient-to-br from-[#3b6fd4]/5 via-background/40 to-background p-4 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] animate-in fade-in duration-300">
        
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
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20 dark:border-blue-500/30">
            <span className="absolute inset-0 rounded-xl bg-blue-500/20 animate-ping opacity-60" style={{ animationDuration: "2.5s" }} />
            <Brain className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400 animate-pulse" />
          </div>

          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-[0.1em] uppercase">
                {mode === "rhetorics" 
                  ? rhetoricsType === "kavita" ? "Composing Kavita" 
                    : rhetoricsType === "speech" ? "Structuring Speech" 
                    : "Formulating Rebuttal"
                  : "Drafting Intervention"}
              </span>
              <span className="inline-flex gap-0.5 text-xs text-blue-500/70">
                <span className="animate-bounce" style={{ animationDelay: "0s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.15s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.3s" }}>.</span>
              </span>
            </div>
            
            <div className="h-4 overflow-hidden relative">
              <AnimatePresence mode="wait">
                <motion.span
                  key={phaseIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="absolute inset-0 text-[11px] text-muted-foreground truncate font-mono"
                >
                  {phases[phaseIndex]}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          <div className="relative w-4 h-4 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-500/70 dark:text-amber-400/80 animate-pulse shrink-0" />
            <Sparkle className="absolute w-2 h-2 text-blue-400/50 dark:text-blue-400/70 animate-ping" />
          </div>
        </div>

        {/* Pulse Bar at Bottom */}
        <div className="absolute bottom-0 inset-x-0 h-[2px] bg-muted/40 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500/40 via-blue-400 to-blue-500/40 w-1/3 rounded-full" 
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
