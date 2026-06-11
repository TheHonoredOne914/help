import * as React from "react";
import { ChevronLeft, ChevronRight, PenLine, Mic2, Globe, Layers, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatModeChipId = "drafting" | "rhetorics" | "fast" | "deep" | "council";

export interface ChatModeChip {
  id: ChatModeChipId;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export const CHAT_MODE_CHIPS: ReadonlyArray<ChatModeChip> = [
  {
    id: "drafting",
    label: "Drafting",
    description: "Draft speeches, clauses, and working papers using archive context.",
    icon: PenLine,
    color: "#22c55e",
  },
  {
    id: "rhetorics",
    label: "Rhetorics",
    description: "Build speeches, POIs, rebuttals, and floor interventions.",
    icon: Mic2,
    color: "#8b5cf6",
  },
  {
    id: "fast",
    label: "Fast Research",
    description: "Quick web lookups and fact-checking during committee sessions.",
    icon: Globe,
    color: "#3b6fd4",
  },
  {
    id: "deep",
    label: "Deep Research",
    description: "Comprehensive synthesis targeting 20-30 cited sources.",
    icon: Layers,
    color: "#3b6fd4",
  },
  {
    id: "council",
    label: "Council",
    description: "Six specialist councillors stress-test the agenda and prepare floor strategy.",
    icon: Users,
    color: "#d4a03b",
  },
];

export interface ChatModeChipsProps {
  activeId: ChatModeChipId;
  onSelect: (id: ChatModeChipId) => void;
  className?: string;
}

export function ChatModeChips({ activeId, onSelect, className }: ChatModeChipsProps) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    window.setTimeout(updateScrollState, 220);
  }, [activeId, updateScrollState]);

  const scrollModes = (direction: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "left" ? -160 : 160,
      behavior: "smooth",
    });
  };

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => scrollModes("left")}
        disabled={!canScrollLeft}
        aria-label="Previous modes"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground shadow-sm transition sm:hidden",
          canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Chat mode"
        className="no-scrollbar flex min-w-0 flex-1 snap-x items-center gap-1.5 overflow-x-auto scroll-smooth px-0.5 [touch-action:pan-x]"
      >
        {CHAT_MODE_CHIPS.map((chip) => {
          const Icon = chip.icon;
          const active = chip.id === activeId;
          return (
          <button
            key={chip.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onSelect(chip.id)}
            className={cn(
              "group/chip relative flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-all sm:h-7",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60",
              active
                ? "border-amber-500/70 bg-amber-500/10 text-amber-700 shadow-[0_0_0_1px_rgba(212,160,59,0.18)] dark:text-amber-100"
                : "border-border/70 bg-background/50 text-foreground/70 hover:border-border hover:bg-muted/60 hover:text-foreground dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100",
            )}
            data-testid={`composer-chip-${chip.id}`}
            title={chip.description}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full transition-all",
                active ? "shadow-[0_0_8px_2px_rgba(212,160,59,0.55)]" : "opacity-60",
              )}
              style={{ backgroundColor: active ? "#d4a03b" : chip.color }}
              aria-hidden
            />
            <Icon
              className="h-3 w-3 shrink-0"
              style={{ color: active ? "#d4a03b" : chip.color }}
              aria-hidden
            />
            <span className="whitespace-nowrap">{chip.label}</span>
          </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => scrollModes("right")}
        disabled={!canScrollRight}
        aria-label="More modes"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground shadow-sm transition sm:hidden",
          canScrollRight ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
