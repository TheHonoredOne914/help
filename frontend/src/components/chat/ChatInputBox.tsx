import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChatInputBoxHandle {
  focus: () => void;
  autoresize: () => void;
  el: HTMLTextAreaElement | null;
}

export interface ChatInputBoxProps {
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  maxRows?: number;
  className?: string;
  ariaLabel?: string;
}

const DEFAULT_MIN_HEIGHT = 72;
const DEFAULT_MAX_HEIGHT = 176;

export const ChatInputBox = React.forwardRef<ChatInputBoxHandle, ChatInputBoxProps>(function ChatInputBox(
  {
    value,
    onChange,
    onKeyDown,
    placeholder,
    disabled,
    className,
    ariaLabel,
  },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const autoresize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(
      Math.max(el.scrollHeight, DEFAULT_MIN_HEIGHT),
      DEFAULT_MAX_HEIGHT,
    );
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > DEFAULT_MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      focus: () => {
        const el = innerRef.current;
        if (!el) return;
        el.focus();
        // Move cursor to end on programmatic focus
        const length = el.value.length;
        try {
          el.setSelectionRange(length, length);
        } catch {
          /* ignore */
        }
      },
      autoresize,
      get el() {
        return innerRef.current;
      },
    }),
    [autoresize],
  );

  // Auto-resize whenever value changes
  React.useEffect(() => {
    autoresize();
  }, [value, autoresize]);

  return (
    <textarea
      ref={innerRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel ?? "Message"}
      rows={2}
      spellCheck
      autoCorrect="on"
      autoCapitalize="sentences"
      className={cn(
        // Transparent, borderless input with auto-resize.
        "block w-full min-h-[56px] max-h-[152px] resize-none border-0 bg-transparent sm:min-h-[64px] sm:max-h-[160px]",
        "py-2.5 pl-3 pr-3 text-sm leading-relaxed text-foreground shadow-none",
        "placeholder:text-muted-foreground/70",
        "focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus:ring-0",
        "sm:pr-[9rem]",
        className,
      )}
      data-testid="input-message"
    />
  );
});
