import * as React from "react";

import { ChevronLeft, ChevronRight, PenLine, Mic2, Globe, Layers, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ChatMode } from "./chat-model-routing";

export type ChatModeChipId = "drafting" | "rhetorics" | "fast" | "deep" | "council";

export interface ChatModeChip {
  id: ChatModeChipId;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  ring: string;
  hex: string;
}

export const CHAT_MODE_CHIPS: ReadonlyArray<ChatModeChip> = [
  {
    id: "drafting",
    label: "Drafting",
    description: "Draft speeches, clauses, and working papers using archive context.",
    icon: PenLine,
    color: "text-[var(--ink)]",
    bg: "bg-[var(--surface)]",
    border: "border-[var(--line)]",
    ring: "ring-[var(--ink)]",
    hex: "var(--ink)",
  },
  {
    id: "rhetorics",
    label: "Rhetorics",
    description: "Build speeches, POIs, rebuttals, and floor interventions.",
    icon: Mic2,
    color: "text-[var(--ink)]",
    bg: "bg-[var(--surface-muted)]",
    border: "border-[var(--ink)]/30",
    ring: "ring-[var(--ink)]",
    hex: "var(--ink)",
  },
  {
    id: "fast",
    label: "Fast Research",
    description: "Quick web lookups and fact-checking during committee sessions.",
    icon: Globe,
    color: "text-[var(--navy)]",
    bg: "bg-[color-mix(in_srgb,var(--navy)_12%,transparent)]",
    border: "border-[color-mix(in_srgb,var(--navy)_28%,transparent)]",
    ring: "ring-[var(--navy)]",
    hex: "var(--navy)",
  },
  {
    id: "deep",
    label: "Deep Research",
    description: "Comprehensive synthesis targeting 20-30 cited sources.",
    icon: Layers,
    color: "text-[var(--navy)]",
    bg: "bg-[color-mix(in_srgb,var(--navy)_12%,transparent)]",
    border: "border-[color-mix(in_srgb,var(--navy)_28%,transparent)]",
    ring: "ring-[var(--navy)]",
    hex: "var(--navy)",
  },
  {
    id: "council",
    label: "Council",
    description: "Six specialist councillors stress-test the agenda and prepare floor strategy.",
    icon: Users,
    color: "text-[var(--brass)]",
    bg: "bg-[var(--accent-secondary-subtle)]",
    border: "border-[var(--accent-secondary-border)]",
    ring: "ring-[var(--brass)]",
    hex: "var(--brass)",
  },
];

const CHIP_BY_ID = Object.fromEntries(CHAT_MODE_CHIPS.map((chip) => [chip.id, chip])) as Record<ChatModeChipId, ChatModeChip>;

export function chatModeToChipId(mode: ChatMode): ChatModeChipId {
  switch (mode) {
    case "fast_research":
      return "fast";
    case "deep_research":
      return "deep";
    case "council":
      return "council";
    default:
      return "drafting";
  }
}

export function getChatModeChip(id: ChatModeChipId): ChatModeChip {
  return CHIP_BY_ID[id];
}

export function getChatModeMeta(mode: ChatMode): ChatModeChip {
  return getChatModeChip(chatModeToChipId(mode));
}

export interface ChatModeChipsProps {
  activeId: ChatModeChipId;
  onSelect: (id: ChatModeChipId) => void;
  className?: string;
}

function selectedChipClass(id: ChatModeChipId): string {
  switch (id) {
    case "fast":
      return "border-[var(--navy)] bg-[color-mix(in_srgb,var(--navy)_8%,transparent)] font-medium text-[var(--navy)]";
    case "deep":
      return "border-[var(--navy)] bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] font-semibold text-[var(--navy)] shadow-[inset_0_0_0_1px_var(--navy)]";
    case "council":
      return "border-[var(--brass)] bg-[var(--accent-secondary-subtle)] font-semibold text-[var(--ink)]";
    case "rhetorics":
      return "border-[var(--ink)]/40 bg-[var(--surface-muted)] font-medium italic text-[var(--ink)]";
    default:
      return "border-[var(--line)] bg-[var(--surface)] font-medium text-[var(--ink)]";
  }
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
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--slate)] transition sm:hidden",
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
                "group/chip relative flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-sm border px-2.5 text-xs transition-all sm:h-7",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)]/40",
                active
                  ? selectedChipClass(chip.id)
                  : "border-[var(--line)] bg-[var(--surface)] font-medium text-[var(--ink)]/70 hover:border-[var(--navy)]/35 hover:bg-[var(--surface-muted)]/60 hover:text-[var(--ink)]",
              )}
              data-testid={`composer-chip-${chip.id}`}
              title={chip.description}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-opacity",
                  active ? "opacity-100" : "opacity-60",
                )}
                style={{ backgroundColor: chip.hex }}
                aria-hidden
              />
              <Icon
                className="h-3 w-3 shrink-0"
                style={{ color: chip.hex }}
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
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--slate)] transition sm:hidden",
          canScrollRight ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
