import { ArchiveIcon, Scale, ChevronDown, Menu, Moon, Plus, Server, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import { useProviderModels } from "@/hooks/use-provider-models";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { isKnownUnavailableChatModel, simplifyModelName } from "@/components/chat/provider-model-display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TopHeaderProps {
  onOpenMobileSidebar?: () => void;
  onCreateArchive?: () => void;
  activeArchiveName?: string | null;
  degraded?: boolean;
}

export function TopHeader({
  onOpenMobileSidebar,
  onCreateArchive,
  activeArchiveName,
  degraded = false,
}: TopHeaderProps) {
  const { healthyResearchModels, selectedModel, isRefreshing } = useProviderModels();
  const { isDark, toggle } = useDarkMode();
  const healthyProviderCount = new Set(healthyResearchModels.map((model) => model.split("/")[0])).size;
  const selectedUnavailable =
    isKnownUnavailableChatModel(selectedModel) ||
    (healthyResearchModels.length > 0 && !healthyResearchModels.includes(selectedModel));
  const selectedModelLabel = simplifyModelName(selectedModel);
  const providerLabel = isRefreshing
    ? "Checking providers"
    : selectedUnavailable
      ? "Selected model unavailable"
      : healthyProviderCount > 0
        ? `${healthyProviderCount} provider${healthyProviderCount === 1 ? "" : "s"} ready`
        : "Provider setup needed";
  const reduce = useReducedMotion();

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-[var(--line)] bg-[var(--bg-header)] backdrop-blur-sm">
      <div className="top-header grid min-h-[54px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-1.5 sm:min-h-[56px] sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="desk-topbar-button h-10 w-10 text-[var(--slate)] hover:border-[var(--navy)]/40 hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] md:hidden"
                onClick={onOpenMobileSidebar}
                aria-label="Open navigation"
              >
                <Menu className="h-4.5 w-4.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open navigation</TooltipContent>
          </Tooltip>

          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--navy)]/40 bg-[var(--navy)] sm:h-10 sm:w-10"
              aria-hidden
            >
              <Scale className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-serif text-lg leading-none text-[var(--ink)] sm:text-xl">
                BestDel
              </div>
              <div className="mt-1 h-px w-10 bg-[var(--brass)]" aria-hidden />
              <div className="mt-1 truncate text-xs font-medium text-[var(--slate)]">
                <span className="md:hidden">{activeArchiveName || "Workspace"}</span>
                <span className="hidden md:inline">Order Paper desk</span>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hidden min-w-0 max-w-[310px] items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-left text-xs text-[var(--slate)] transition-colors hover:border-[var(--brass)]/55 hover:text-[var(--ink)] md:inline-flex"
                aria-label="Open active archive menu"
              >
                <ArchiveIcon className="h-3.5 w-3.5 shrink-0 text-[var(--brass)]" />
                <span className="shrink-0 font-medium text-[var(--brass)]">Active Archive</span>
                <span className="truncate text-[var(--ink)]/80">{activeArchiveName || "Workspace"}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--slate)]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 border-[var(--line)] bg-popover text-popover-foreground">
              <DropdownMenuLabel className="text-2xs uppercase tracking-[0.12em] text-[var(--slate)]">
                Archive workspace
              </DropdownMenuLabel>
              <DropdownMenuItem disabled className="rounded-md text-xs text-[var(--ink)] opacity-100">
                {activeArchiveName || "No archive selected"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[var(--line)]" />
              <DropdownMenuItem disabled className="rounded-md text-xs text-[var(--slate)] opacity-100">
                Use the sidebar dossier list to switch archives.
              </DropdownMenuItem>
              {onCreateArchive && (
                <DropdownMenuItem
                  onClick={onCreateArchive}
                  className="rounded-md text-xs text-[var(--brass)] focus:bg-[var(--accent-secondary-subtle)] focus:text-[var(--brass)]"
                >
                  Create new archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {onCreateArchive && (
          <div className="ml-auto flex min-w-0 items-center gap-1.5 justify-self-end sm:gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden max-w-[230px] items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--slate)] lg:inline-flex">
                  <Server className="h-3.5 w-3.5 text-[var(--brass)]" />
                  <span className="truncate">{providerLabel}</span>
                  {healthyProviderCount > 0 && (
                    <span className="truncate text-[var(--slate)]/70">/ {selectedModelLabel}</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {healthyProviderCount > 0 ? `Active model: ${selectedModelLabel}` : "Configure provider keys in Settings"}
              </TooltipContent>
            </Tooltip>
            <div className={selectedUnavailable || degraded || healthyProviderCount === 0 ? "status-pill-degraded topbar-status-pill" : "status-pill-ready topbar-status-pill"}>
              {reduce ? (
                <span className="status-dot" />
              ) : (
                <motion.span
                  className="status-dot"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <span className="hidden min-[390px]:inline">
                {selectedUnavailable || degraded ? "AI degraded" : healthyProviderCount === 0 ? "No providers" : "AI ready"}
              </span>
              <span className="min-[390px]:hidden">
                {selectedUnavailable || degraded ? "AI" : healthyProviderCount === 0 ? "None" : "Ready"}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="desk-topbar-button h-10 w-10 text-[var(--slate)] hover:border-[var(--navy)]/40 hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] md:hidden"
                  onClick={toggle}
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              onClick={onCreateArchive}
              className="desk-topbar-button desk-topbar-primary h-10 shrink-0 gap-2 border border-[var(--accent-secondary-border)] bg-[var(--brass)] px-2.5 text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--brass)_88%,white)] sm:h-9 sm:px-3"
              data-testid="button-top-new-archive"
              aria-label="Create new archive"
            >
              <ArchiveIcon className="hidden h-4 w-4 sm:block" />
              <Plus className="h-4 w-4 sm:hidden" />
              <span>New Archive</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
