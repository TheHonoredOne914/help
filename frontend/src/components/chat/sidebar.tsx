import {
  useListAnthropicConversations,
  useDeleteAnthropicConversation,
  getListAnthropicConversationsQueryKey,
  useListArchives,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  ArchiveIcon,
  Scale,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { SettingsDialog } from "./settings-dialog";
import { ModelLimitsPanel } from "./model-limits";
import { apiFetch } from "@/lib/api-fetch";
import { motion, useReducedMotion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

const conversationDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatConversationDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return "Created";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  if (date >= startOfToday) return `Created today, ${time}`;
  if (date >= startOfYesterday) return `Created yesterday, ${time}`;
  return `Created ${conversationDateFormatter.format(date)}`;
}

interface SidebarProps {
  activeConversationId: number | null;
  activeArchiveId: number | null;
  onSelectConversation: (id: number | null) => void;
  onSelectArchive: (id: number) => void;
  onCreateArchive?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface ConversationRowProps {
  conv: { id: number; title: string; createdAt: string | Date };
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => boolean | void | Promise<boolean | void>;
}

interface ArchiveCardProps {
  archive: { id: number; name: string; topic?: string | null };
  isActive: boolean;
  onSelect: () => void;
}

interface SharedSidebarContentProps {
  activeConversationId: number | null;
  activeArchiveId: number | null;
  onSelectConversation: (id: number | null) => void;
  onSelectArchive: (id: number) => void;
  onCreateArchive?: () => void;
  onMobileClose?: () => void;
  layout: "desktop" | "mobile";
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

function ConversationRow({ conv, isActive, onSelect, onDelete, onRename }: ConversationRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conv.title);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const ignoreClickRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commit = async () => {
    const trimmed = draftTitle.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== conv.title) {
      const ok = await onRename(trimmed);
      if (ok === false) setDraftTitle(conv.title);
      return;
    }
    setDraftTitle(conv.title);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx > 0) setSwipeOffset(Math.min(dx, 80));
    else if (revealed && dx < 0) setSwipeOffset(Math.max(80 + dx, 0));
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    if (swipeOffset > 40) {
      setSwipeOffset(80);
      setRevealed(true);
      ignoreClickRef.current = true;
      return;
    }
    setSwipeOffset(0);
    setRevealed(false);
  };

  return (
    <div className="relative overflow-hidden rounded-lg sidebar-item-in">
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex items-center justify-start pl-3 bg-destructive/10 md:hidden transition-opacity",
          swipeOffset > 0 ? "opacity-100" : "opacity-0",
        )}
        style={{ width: 80 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-md p-2 text-destructive hover:bg-destructive/20"
          aria-label="Delete conversation"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div
        onClick={() => {
          if (ignoreClickRef.current) {
            ignoreClickRef.current = false;
            return;
          }
          if (revealed || swipeOffset > 0) {
            setSwipeOffset(0);
            setRevealed(false);
            return;
          }
          if (!isEditing) onSelect();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "group relative flex items-center justify-between rounded-lg border px-3 py-3 transition-all",
          isActive
            ? "border-[color-mix(in_srgb,var(--navy)_19%,transparent)] bg-[color-mix(in_srgb,var(--navy)_8%,transparent)] text-sidebar-foreground shadow-sm"
            : "border-[var(--line)] bg-white/55 text-sidebar-foreground hover:border-[color-mix(in_srgb,var(--navy)_19%,transparent)] hover:bg-sidebar-accent/70 dark:border-sidebar-border/50 dark:bg-sidebar/70",
        )}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: touchStartX.current === null ? "transform 0.2s" : undefined,
        }}
        data-testid={`card-conversation-${conv.id}`}
      >
        <div
          className={cn(
            "absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-opacity",
            isActive ? "bg-[var(--navy)] opacity-100" : "bg-transparent opacity-0",
          )}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
              isActive
                ? "border-[color-mix(in_srgb,var(--navy)_19%,transparent)] bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] text-[var(--navy)] dark:border-white/18 dark:bg-white/10 dark:text-white"
                : "border-[var(--line)] bg-white/60 text-[var(--slate)] dark:border-sidebar-border/60 dark:bg-[var(--surface)]/60",
            )}
          >
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {isEditing ? (
              <input
                ref={inputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  } else if (e.key === "Escape") {
                    setDraftTitle(conv.title);
                    setIsEditing(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-1.5 py-0.5 text-sm font-medium outline-none focus:ring-1 focus:ring-primary/40"
                data-testid={`input-rename-conversation-${conv.id}`}
              />
            ) : (
              <span
                className="truncate text-sm font-medium"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setDraftTitle(conv.title);
                  setIsEditing(true);
                }}
                title="Double-click to rename"
              >
                {conv.title}
              </span>
            )}
            <span className="truncate text-xs text-[var(--slate)]">
              {formatConversationDate(new Date(conv.createdAt))}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-delete-btn hidden h-8 w-8 shrink-0 rounded-md text-[var(--slate)] hover:bg-destructive/10 hover:text-destructive md:inline-flex"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          data-testid={`button-delete-conversation-${conv.id}`}
          aria-label={`Delete conversation ${conv.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ArchiveCard({ archive, isActive, onSelect }: ArchiveCardProps) {
  const reduce = useReducedMotion();
  const className = cn(
    "group relative w-full rounded-md border px-3 py-3 text-left transition-all",
    isActive
      ? "border-[color-mix(in_srgb,var(--navy)_19%,transparent)] bg-[color-mix(in_srgb,var(--navy)_8%,transparent)] text-sidebar-foreground shadow-sm dark:bg-[var(--surface-muted)] dark:text-[var(--ink)]"
      : "border-transparent bg-transparent text-[var(--slate)] hover:border-[var(--line)] hover:bg-[var(--surface)]/55 hover:text-[var(--ink)] dark:hover:bg-[var(--surface-muted)]",
  );
  const body = (
    <>
      <div
        className={cn(
          "absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-opacity",
          isActive ? "bg-[var(--navy)] opacity-100" : "bg-transparent opacity-0",
        )}
        aria-hidden
      />
      <div className="flex items-start gap-3 pl-1">
        <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
              isActive
                ? "border-[color-mix(in_srgb,var(--navy)_19%,transparent)] bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] text-[var(--navy)]"
                : "border-[var(--line)] bg-[var(--surface)]/60 text-[var(--slate)] dark:border-[var(--line)] dark:bg-[var(--surface-muted)] dark:text-[var(--slate)]",
            )}
          >
          <ArchiveIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-medium", isActive ? "text-[var(--navy)] dark:text-white" : "text-[var(--ink)] dark:text-[var(--ink)]")}>{archive.name}</div>
          <div className={cn("mt-1 line-clamp-2 text-xs leading-4", isActive ? "text-[var(--slate)] dark:text-white/70" : "text-[var(--slate)] dark:text-[var(--slate)]")}>
            {archive.topic?.trim() || "Workspace archive"}
          </div>
        </div>
      </div>
    </>
  );
  if (reduce) {
    return (
      <button type="button" onClick={onSelect} className={className} data-testid={`button-archive-${archive.id}`}>
        {body}
      </button>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={className}
      data-testid={`button-archive-${archive.id}`}
    >
      {body}
    </motion.button>
  );
}

function SharedSidebarContent({
  activeConversationId,
  activeArchiveId,
  onSelectConversation,
  onSelectArchive,
  onCreateArchive,
  onMobileClose,
  layout,
  settingsOpen,
  setSettingsOpen,
}: SharedSidebarContentProps) {
  const { data: conversations, isLoading } = useListAnthropicConversations(activeArchiveId);
  const { data: archives = [] } = useListArchives();
  const deleteMutation = useDeleteAnthropicConversation();
  const queryClient = useQueryClient();
  const { isDark, toggle } = useDarkMode();
  const [search, setSearch] = useState("");
  const isMobile = layout === "mobile";

  const handleDelete = (id: number) => {
    if (!window.confirm("Delete this conversation?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
          if (activeConversationId === id) {
            onSelectConversation(null);
            onMobileClose?.();
          }
        },
        onError: () => {
          toast({ title: "Couldn't delete conversation", variant: "destructive" });
        },
      },
    );
  };

  const handleSelectConversation = (id: number | null) => {
    onSelectConversation(id);
    onMobileClose?.();
  };

  const handleRename = async (id: number, title: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/anthropic/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        toast({ title: "Couldn't rename conversation", variant: "destructive" });
        return false;
      }
      queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
      return true;
    } catch (error) {
      console.error("Rename failed", error);
      toast({ title: "Couldn't rename conversation", variant: "destructive" });
      return false;
    }
  };

  const filtered = useMemo(
    () =>
      (conversations ?? []).filter((conversation) =>
        search.trim() === ""
          ? true
          : conversation.title.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [conversations, search],
  );

  const activeArchive = archives.find((archive) => archive.id === activeArchiveId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white/88 backdrop-blur-2xl dark:bg-[var(--surface)]">
      <div className="h-0.5 shrink-0 bg-[var(--brass)]" aria-hidden />

      <div
        className={cn(
          "shrink-0 overflow-hidden border-b border-[var(--line)] dark:border-[var(--line)]",
          isMobile ? "max-h-[50dvh] p-4" : "max-h-[54dvh] px-5 py-4",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--navy)]">
              Order Paper
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--ink)] dark:text-[var(--ink)]">Dossier navigation</h2>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--slate)] dark:text-[var(--slate)]">
              {activeArchive ? activeArchive.topic || activeArchive.name : "Choose an archive to begin."}
            </p>
          </div>
          {isMobile && (
            <button
              onClick={toggle}
              className="rounded-md border border-sidebar-border/60 bg-[var(--surface)]/60 p-2 text-[var(--slate)] transition-colors hover:text-sidebar-foreground"
              aria-label="Toggle dark mode"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </div>

        {isMobile && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              className="h-11 justify-start gap-2 rounded-md shadow-sm"
              onClick={() => activeArchiveId && handleSelectConversation(null)}
              disabled={!activeArchiveId}
              data-testid="button-new-chat"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
            <Button
              variant="outline"
              className="h-11 justify-start gap-2 rounded-md bg-[var(--surface)]/80"
              onClick={() => {
                onCreateArchive?.();
                onMobileClose?.();
              }}
              data-testid="button-new-archive"
            >
              <ArchiveIcon className="h-4 w-4" />
              New Archive
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--slate)] dark:text-[var(--slate)]">Dossiers</p>
            {activeArchive && <span className="text-xs text-[var(--slate)] dark:text-[var(--slate)]">Active brief</span>}
          </div>
          <div className={cn("grid gap-2 pr-1", isMobile ? "max-h-36 overflow-y-auto overscroll-contain" : "max-h-44 overflow-y-auto overscroll-contain")}>
            {archives.length === 0 ? (
              <div className="rounded-lg border border-dashed border-sidebar-border/60 px-4 py-5 text-xs text-[var(--slate)]">
                No dossiers yet. Create one to organize your workspace.
              </div>
            ) : (
              archives.map((archive) => (
                <ArchiveCard
                  key={archive.id}
                  archive={archive}
                  isActive={activeArchiveId === archive.id}
                  onSelect={() => onSelectArchive(archive.id)}
                />
              ))
            )}
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--slate)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="h-10 rounded-md border-[var(--line)] bg-white/70 pl-9 text-xs text-[var(--ink)] placeholder:text-[var(--slate)] focus-visible:ring-[var(--navy)] dark:border-[var(--line)] dark:bg-[var(--surface-muted)] dark:text-[var(--ink)] dark:placeholder:text-[var(--slate)]"
            data-testid="input-search-conversations"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className={cn("space-y-3", isMobile ? "p-4" : "px-5 py-4")}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--slate)] dark:text-[var(--slate)]">Conversations</p>
            {activeArchive && filtered.length > 0 && (
              <span className="text-xs text-[var(--slate)]">{filtered.length} items</span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-lg bg-[var(--surface-muted)]/50" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-sidebar-border/60 px-4 py-8 text-center text-xs text-[var(--slate)]">
              {activeArchiveId
                ? "No conversations in this archive yet. Start a new chat."
                : "Choose an archive to begin."}
            </div>
          ) : (
            filtered.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conv={conversation}
                isActive={activeConversationId === conversation.id}
                onSelect={() => handleSelectConversation(conversation.id)}
                onDelete={() => handleDelete(conversation.id)}
                onRename={(title) => handleRename(conversation.id, title)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <div
        className={cn(
          "shrink-0 overflow-y-auto border-t border-[var(--line)] dark:border-[var(--line)]",
          isMobile ? "max-h-[34dvh] p-4" : "max-h-[36dvh] px-5 py-4",
        )}
      >
        <div className="rounded-md border border-[var(--line)] bg-white/65 p-3 shadow-[0_8px_24px_rgba(16,24,40,0.04)] dark:border-[var(--line)] dark:bg-[var(--surface-muted)]">
          <ModelLimitsPanel />
        </div>

        {isMobile && (
          <>
            <button
              onClick={() => setSettingsOpen(true)}
              className="mt-3 flex w-full items-center gap-3 rounded-lg border border-sidebar-border/60 bg-sidebar/70 px-3 py-3 text-left transition-colors hover:bg-sidebar-accent/70"
              aria-label="Settings"
            >
              <SettingsIcon className="h-4 w-4 text-[var(--slate)]" />
              <span className="text-xs font-medium text-sidebar-foreground">Settings & system prompts</span>
            </button>

            <button
              onClick={toggle}
              className="mt-2 flex w-full items-center justify-between rounded-lg border border-sidebar-border/60 bg-sidebar/70 px-3 py-3 transition-colors hover:bg-sidebar-accent/70"
              aria-label="Toggle dark mode"
            >
              <div className="flex items-center gap-3">
                {isDark ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4 text-[var(--slate)]" />
                )}
                <span className="text-xs font-medium text-sidebar-foreground">
                  {isDark ? "Light mode" : "Dark mode"}
                </span>
              </div>
              <div
                className={cn(
                  "relative h-4 w-8 rounded-full transition-colors",
                  isDark ? "bg-primary" : "bg-[var(--surface-muted)]",
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform",
                    isDark ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </div>
            </button>
          </>
        )}

      </div>
    </div>
  );
}

function RailTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function DesktopSidebar({
  activeConversationId,
  activeArchiveId,
  onSelectConversation,
  onSelectArchive,
  onCreateArchive,
}: Omit<SidebarProps, "mobileOpen" | "onMobileClose">) {
  const { isDark, toggle } = useDarkMode();
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reduce = useReducedMotion();
  const railClassName = "relative z-20 hidden h-full shrink-0 border-r border-[var(--line)] bg-[var(--surface)]/72 shadow-[8px_0_24px_rgba(16,24,40,0.04)] backdrop-blur-2xl md:flex dark:border-[var(--line)] dark:bg-[var(--surface)]";
  const panelClassName = cn(
    "relative h-full shrink-0 overflow-hidden border-r border-[var(--line)] bg-[var(--surface)]/82 backdrop-blur-2xl dark:border-[var(--line)] dark:bg-[var(--surface)]",
    !desktopExpanded && "pointer-events-none",
  );

  const railInner = (
    <>
      <div className="flex w-16 shrink-0 flex-col items-center justify-between border-r border-[var(--line)] px-2 py-3 dark:border-[var(--line)]">
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--navy)_40%,transparent)] bg-[var(--navy)]">
            <Scale className="h-5 w-5 text-white" />
          </div>

          <div className="pt-1 text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--slate)] dark:text-[var(--muted-ink)]">Desk</div>

          <RailTooltip label={desktopExpanded ? "Collapse navigation panel" : "Expand navigation panel"}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md border border-[var(--line)] bg-white/70 text-[var(--slate)] hover:border-[color-mix(in_srgb,var(--navy)_31%,transparent)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] dark:border-[var(--line)] dark:bg-[var(--surface-muted)] dark:text-[var(--muted-ink)] dark:hover:bg-[var(--surface-muted)] dark:hover:text-[var(--ink)]"
              onClick={() => setDesktopExpanded((current) => !current)}
              aria-label={desktopExpanded ? "Collapse navigation panel" : "Expand navigation panel"}
            >
              {desktopExpanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
          </RailTooltip>

          <RailTooltip label="New chat">
            <Button
              size="icon"
              className="h-9 w-9 rounded-md bg-[var(--navy)] text-white  hover:bg-[var(--navy-hover)]"
              onClick={() => activeArchiveId && onSelectConversation(null)}
              disabled={!activeArchiveId}
              aria-label="New chat"
              data-testid="button-new-chat"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </RailTooltip>

          <RailTooltip label="New archive">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-md border-[var(--line)] bg-white/70 text-[var(--slate)] hover:border-[color-mix(in_srgb,var(--brass)_31%,transparent)] hover:bg-[var(--surface-muted)] hover:text-[var(--brass)] dark:border-[var(--line)] dark:bg-[var(--surface-muted)] dark:text-[var(--muted-ink)] dark:hover:bg-[var(--surface-muted)]"
              onClick={onCreateArchive}
              aria-label="New archive"
              data-testid="button-new-archive"
            >
              <ArchiveIcon className="h-4 w-4" />
            </Button>
          </RailTooltip>
        </div>

        <div className="flex w-full flex-col items-center gap-3 border-t border-[var(--line)] pt-3 dark:border-[var(--line)]">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--slate)] dark:text-[var(--muted-ink)]">System</div>
          <RailTooltip label="Settings and provider keys">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md border border-[var(--line)] bg-white/70 text-[var(--slate)] hover:border-[color-mix(in_srgb,var(--navy)_31%,transparent)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] dark:border-[var(--line)] dark:bg-[var(--surface-muted)] dark:text-[var(--muted-ink)] dark:hover:bg-[var(--surface-muted)] dark:hover:text-[var(--ink)]"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings and provider keys"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </RailTooltip>

          <RailTooltip label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md border border-[var(--line)] bg-white/70 text-[var(--slate)] hover:border-[color-mix(in_srgb,var(--brass)_31%,transparent)] hover:bg-[var(--surface-muted)] hover:text-[var(--brass)] dark:border-[var(--line)] dark:bg-[var(--surface-muted)] dark:text-[var(--muted-ink)] dark:hover:bg-[var(--surface-muted)]"
              onClick={toggle}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </Button>
          </RailTooltip>
        </div>
      </div>

      {reduce ? (
        <div
          className={panelClassName}
          style={{ width: desktopExpanded ? 288 : 0, opacity: desktopExpanded ? 1 : 0 }}
        >
          <div className="h-full w-[288px]">
            <SharedSidebarContent
              activeConversationId={activeConversationId}
              activeArchiveId={activeArchiveId}
              onSelectConversation={onSelectConversation}
              onSelectArchive={onSelectArchive}
              onCreateArchive={onCreateArchive}
              layout="desktop"
              settingsOpen={settingsOpen}
              setSettingsOpen={setSettingsOpen}
            />
          </div>
        </div>
      ) : (
        <motion.div
          initial={false}
          animate={{
            width: desktopExpanded ? 288 : 0,
            opacity: desktopExpanded ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={panelClassName}
        >
          <div className="h-full w-[288px]">
            <SharedSidebarContent
              activeConversationId={activeConversationId}
              activeArchiveId={activeArchiveId}
              onSelectConversation={onSelectConversation}
              onSelectArchive={onSelectArchive}
              onCreateArchive={onCreateArchive}
              layout="desktop"
              settingsOpen={settingsOpen}
              setSettingsOpen={setSettingsOpen}
            />
          </div>
        </motion.div>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );

  if (reduce) {
    return <aside className={railClassName}>{railInner}</aside>;
  }

  return (
    <motion.aside initial={false} className={railClassName}>
      {railInner}
    </motion.aside>
  );
}

export function Sidebar({
  activeConversationId,
  activeArchiveId,
  onSelectConversation,
  onSelectArchive,
  onCreateArchive,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  return (
    <>
      <DesktopSidebar
        activeConversationId={activeConversationId}
        activeArchiveId={activeArchiveId}
        onSelectConversation={onSelectConversation}
        onSelectArchive={onSelectArchive}
        onCreateArchive={onCreateArchive}
      />

      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent side="left" className="h-dvh w-[min(92vw,22rem)] overflow-hidden border-r border-sidebar-border/60 p-0 sm:w-80">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SharedSidebarContent
            activeConversationId={activeConversationId}
            activeArchiveId={activeArchiveId}
            onSelectConversation={onSelectConversation}
            onSelectArchive={onSelectArchive}
            onCreateArchive={onCreateArchive}
            onMobileClose={onMobileClose}
            layout="mobile"
            settingsOpen={mobileSettingsOpen}
            setSettingsOpen={setMobileSettingsOpen}
          />
        </SheetContent>
      </Sheet>
      <SettingsDialog open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen} />
    </>
  );
}
