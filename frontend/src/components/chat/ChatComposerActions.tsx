import * as React from "react";
import { Loader2, Send, Square, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ChatComposerActionsProps {
  value: string;
  maxLength?: number;
  isStreaming: boolean;
  isEnhancing: boolean;
  disabled?: boolean;
  onSend: () => void;
  onStop: () => void;
  onEnhance: () => void;
  className?: string;
}

const DEFAULT_MAX_LENGTH = 4000;

export function ChatComposerActions({
  value,
  maxLength = DEFAULT_MAX_LENGTH,
  isStreaming,
  isEnhancing,
  disabled,
  onSend,
  onStop,
  onEnhance,
  className,
}: ChatComposerActionsProps) {
  const length = value.length;
  const pct = Math.min(1, length / maxLength);
  const isDanger = length > maxLength;
  const isWarn = length > maxLength * 0.75;
  const r = 8;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const trimmed = value.trim();

  const showStop = isStreaming;

  return (
    <div className={cn("flex shrink-0 items-center gap-1.5 sm:gap-2", className)}>
      {/* Enhance button (left) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEnhance}
            disabled={!trimmed || isEnhancing || isStreaming || disabled}
            className={cn(
              "h-8 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted/70 hover:text-[#8a5b13] sm:px-2.5 dark:text-[#9a9ab0] dark:hover:bg-white/[0.04] dark:hover:text-[#d4a03b]",
              trimmed && !isEnhancing && !isStreaming && "text-[#8a5b13] dark:text-[#d4a03b]",
            )}
            aria-label="Enhance prompt with AI"
            data-testid="button-enhance-prompt"
          >
            {isEnhancing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            <span className="hidden md:inline font-medium">Enhance</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Enhance prompt with AI</TooltipContent>
      </Tooltip>

      {/* Char counter with ring (middle) */}
      <div
        className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-background/65 px-2 py-1 min-[380px]:flex dark:border-white/5 dark:bg-white/[0.02]"
        data-testid="char-counter"
        title={`${length} / ${maxLength} chars`}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" className="shrink-0">
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted-foreground/20 dark:text-white/10"
          />
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={cn(
              "transition-colors",
              isDanger
                ? "text-red-500"
                : isWarn
                  ? "text-amber-400"
                  : "text-[#d4a03b]",
            )}
          />
        </svg>
        <span
          className={cn(
            "text-[10px] tabular-nums",
            isDanger
              ? "text-red-400 font-medium"
              : isWarn
                ? "text-amber-300 font-medium"
                : "text-muted-foreground dark:text-[#8b8b9f]",
          )}
        >
          {length}/{maxLength}
        </span>
      </div>

      {/* Send / Stop button (right) */}
      {showStop ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
              className="h-9 w-9 rounded-xl bg-red-500/90 text-white shadow-[0_8px_24px_-6px_rgba(239,68,68,0.55)] hover:bg-red-500"
              data-testid="button-stop-stream"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop generating</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              onClick={onSend}
              disabled={!trimmed || isDanger || disabled}
              aria-label="Send message"
              title="Send message"
              className={cn(
                "h-10 w-10 rounded-xl text-white transition-all sm:h-9 sm:w-9",
                trimmed && !isDanger
                  ? "bg-[#d4a03b] text-[#111215] shadow-[0_12px_28px_rgba(212,160,59,0.32)] hover:bg-[#f3c76f]"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 dark:bg-white/[0.04] dark:text-[#4a4a5e] dark:hover:bg-white/[0.06]",
              )}
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Send message</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
