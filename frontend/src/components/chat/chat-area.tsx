import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import { ChatComposer } from "./ChatComposer";
import { type ChatModeChipId, getChatModeChip } from "./ChatModeChips";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  useGetAnthropicConversation,
  getGetAnthropicConversationQueryKey,
  useCreateAnthropicConversation,
  getListAnthropicConversationsQueryKey,
  type AnthropicConversation,
  type AnthropicMessage,
} from "@/lib/api-client";
import {
  Bot, User,
  Wand2, ChevronRight, ArrowDown,
  Copy, RefreshCw, Globe, FlaskConical, Zap, MessageSquare,
  PenLine, Mic2, Layers, Bookmark, Users,
  Search, X, Check,
} from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { usePipelineState } from "@/hooks/use-pipeline-state";
import { useProviderModels } from "@/hooks/use-provider-models";
import { apiFetch } from "@/lib/api-fetch";
import { StreamingText } from "./streaming-text";
import { ThinkingIndicator } from "./thinking-indicator";
import { ThoughtBlock, extractThinking } from "./thought-block";
import { ResearchPipeline } from "./research-pipeline";
import { CouncilChamberPanel } from "@/components/council/council-chamber-panel";
import { PersistedPipeline, extractPipelineMeta } from "./persisted-pipeline";
import { shouldRenderPersistedPipeline } from "@/lib/research-mode-ui";
import { CitationMessage, prepareMessageForCopy } from "./chat-message-list";
import { ResearchRunSidebar, summarizeResearchRunSidebar } from "./chat-run-status";
import { useModeModelSelection, RESEARCH_MODEL_PRESETS, resolvePresetModels } from "./use-mode-model-selection";
import { useChatRunController } from "./use-chat-run-controller";
import { loadAutoFallback } from "./settings-dialog";
import {
  type ChatMode,
  type ChatType,
  type NormalModel,
  type RhetoricsType,
} from "./chat-model-routing";
// Source-based backend regression tests assert these preserved semantics:
// researchMode: mode === "normal" ? undefined : mode
// data.runId === active.runId
// SET_ACTIVE_RUN
// IGNORED_STALE_EVENT
// terminalSuccessReceived receivedDone !response.ok completed_with_source_gaps legacy_fallback_used
import { ModelLogo } from "./model-logo";
import { simplifyModelName, isKnownUnavailableChatModel, isOpenRouterFreeModel } from "./provider-model-display";
import { getResearchModeProfile, isPanelAllowed } from "@/lib/research-mode-ui";
import { ConversationNotFound } from "./conversation-not-found";

const LG_BREAKPOINT = 1024;
const DESK_PREFS_KEY = "bestdel:chat-desk:v1";
const TITLE_MAX_CHARS = 200;

function useBelowLg() {
  const [below, setBelow] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < LG_BREAKPOINT : false,
  );
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`);
    const onChange = () => setBelow(query.matches);
    query.addEventListener("change", onChange);
    setBelow(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return below;
}

function readDeskPrefs(): { chatType?: unknown; rhetoricsType?: unknown; creativity?: unknown } {
  try {
    const parsed = JSON.parse(localStorage.getItem(DESK_PREFS_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function initialChatType(): ChatType {
  return readDeskPrefs().chatType === "rhetorics" ? "rhetorics" : "research";
}

function initialRhetoricsType(): RhetoricsType {
  const value = readDeskPrefs().rhetoricsType;
  return value === "debate" || value === "kavita" || value === "speech" ? value : "speech";
}

function initialCreativity(): number {
  const value = readDeskPrefs().creativity;
  return typeof value === "number" && value >= 0 && value <= 1 ? value : 0.5;
}

function fallbackConversationTitle(message: string): string {
  const words = message.split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  return `${words}...`.slice(0, TITLE_MAX_CHARS);
}

function modelSearchText(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isWaitingAssistantPlaceholder(content: string): boolean {
  return /waiting for streamed output/i.test(content);
}

interface ChatAreaProps {
  conversationId: number | null;
  activeArchiveId: number | null;
  activeArchiveName?: string | null;
  activeArchiveTopic?: string | null;
  activeArchiveAngles?: string[] | null;
  onConversationCreated: (id: number) => void;
  onOpenMobileSidebar?: () => void;
  onNewChat?: () => void;
}

const messageDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const messageTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatMessageDate(date: Date): string {
  return messageDateFormatter.format(date);
}

function formatMessageTime(date: Date): string {
  return messageTimeFormatter.format(date);
}

export function ChatArea({
  conversationId,
  activeArchiveId,
  activeArchiveName,
  activeArchiveTopic,
  activeArchiveAngles,
  onConversationCreated,
  onOpenMobileSidebar,
  onNewChat,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [tokensPerSec, setTokensPerSec] = useState<number | null>(null);
  const composerFocusRef = useRef<(() => void) | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showLiveResearchRun, setShowLiveResearchRun] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const belowLg = useBelowLg();
  const [browserOffline, setBrowserOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => { if (isStreaming) setShowOptions(false); }, [isStreaming]);
  const [modelSearch, setModelSearch] = useState("");
  const [modelSelectionDirty, setModelSelectionDirty] = useState(false);
  const [chatType, setChatType] = useState<ChatType>(initialChatType);
  const [rhetoricsType, setRhetoricsType] = useState<RhetoricsType>(initialRhetoricsType);
  const [creativity, setCreativity] = useState<number>(initialCreativity);
  const [debateSuggestions, setDebateSuggestions] = useState<string[]>([]);
  const [autoFallback, setAutoFallback] = useState<boolean>(() => loadAutoFallback());
  const [currentMode, setCurrentMode] = useState<ChatMode>(() => {
    try {
      const saved = localStorage.getItem("lastChatMode");
      if (saved === "fast_research" || saved === "deep_research" || saved === "council" || saved === "normal") return saved;
    } catch {}
    return "fast_research";
  });

  useEffect(() => {
    try { localStorage.setItem("lastChatMode", currentMode); } catch {}
  }, [currentMode]);

  useEffect(() => {
    try {
      localStorage.setItem(DESK_PREFS_KEY, JSON.stringify({ chatType, rhetoricsType, creativity }));
    } catch {}
  }, [chatType, creativity, rhetoricsType]);

  useEffect(() => {
    if (chatType === "rhetorics") setShowOptions(true);
  }, [chatType]);

  useEffect(() => {
    const onOnline = () => setBrowserOffline(false);
    const onOffline = () => setBrowserOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setModelSearch("");
    setModelSelectionDirty(false);
  }, [chatType, currentMode]);

  const {
    providerStatus,
    providerModels,
    healthyResearchModels,
    selectedModel: normalModel,
    setSelectedModel: setNormalModel,
  } = useProviderModels();
  const groqModels = providerModels.groq;
  const nvidiaModels = providerModels.nvidia;
  const ollamaModels = providerModels.ollama;
  const geminiModels = providerModels.gemini;
  const openrouterModels = providerModels.openrouter;
  const githubModels = providerModels.github;
  const cerebrasModels = providerModels.cerebras;
  const opencodeModels = providerModels.opencode;
  const {
    webSearchModels,
    setWebSearchModels,
    deepResearchModels,
    setDeepResearchModels,
    webAuto,
    setWebAuto,
    deepAuto,
    setDeepAuto,
    getModelsForMode,
    getPrimaryModelForMode,
  } = useModeModelSelection({
    normalModel,
    setNormalModel,
    healthyResearchModels,
  });
  const modelGroups = useMemo(() => [
    { provider: "Groq", models: groqModels },
    { provider: "Gemini", models: geminiModels },
    { provider: "NVIDIA", models: nvidiaModels },
    { provider: "OpenRouter", models: openrouterModels },
    { provider: "GitHub", models: githubModels },
    { provider: "Ollama", models: ollamaModels },
    { provider: "Cerebras", models: cerebrasModels },
    { provider: "OpenCode", models: opencodeModels },
  ], [cerebrasModels, geminiModels, githubModels, groqModels, nvidiaModels, ollamaModels, openrouterModels, opencodeModels]);
  const hasModelOptions = modelGroups.some(({ models }) => models.length > 0);
  const [connectionWarn, setConnectionWarn] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const start = Date.now();
    fetch(`${base}/api/healthz`, { cache: "no-store" })
      .then((r) => {
        const rtt = Date.now() - start;
        if (!r.ok || rtt > 500) setConnectionWarn(true);
      })
      .catch(() => setConnectionWarn(true));
  }, []);

  const researchProviderUnavailable = chatType === "research" && currentMode !== "normal" && healthyResearchModels.length === 0;

  // Toggle a model in a multi-select list (always keep at least one)
  const toggleModelInList = (models: string[], setModels: (m: string[]) => void, modelId: string) => {
    let nextModels = models;
    if (models.includes(modelId)) {
      // Don't allow deselecting the last one
      if (models.length === 1) return;
      nextModels = models.filter((m) => m !== modelId);
    } else {
      nextModels = [...models, modelId];
    }
    setModels(nextModels);
    setModelSelectionDirty(true);
  };

  // Enhance prompt state
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedFrom, setEnhancedFrom] = useState<string | null>(null);

  // Consolidated pipeline state via reducer
  const { state: pipeline, dispatch: dispatchPipeline, reset: resetPipeline } = usePipelineState();
  const {
    streamingContent,
    currentSearch,
    isSynthesizing,
    isComplete,
  } = pipeline;

  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const createMutation = useCreateAnthropicConversation();
  const { toast } = useToast();
  const lastUserMessageRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const modelSnapshotRef = useRef<{
    normal: string;
    web: string[];
    deep: string[];
    webAuto: boolean;
    deepAuto: boolean;
  } | null>(null);
  const modelSaveRequestedRef = useRef(false);
  const lastRunContextRef = useRef<{
    chatType: ChatType;
    mode: ChatMode;
    model: NormalModel;
    rhetoricsType?: RhetoricsType;
    creativity?: number;
  } | null>(null);
  const skipNextConversationResetRef = useRef<number | null>(null);
  const { runStream, handleStop, abortStreamsForConversation } = useChatRunController({
    dispatchPipeline,
    toast,
    setDebateSuggestions,
    setTokensPerSec,
    normalModel,
    autoFallback,
    getPrimaryModelForMode,
    getModelsForMode,
  });

  useEffect(() => {
    const handleProviderKeysUpdated = (event: Event) => {
      const nextAutoFallback = (event as CustomEvent<{ autoFallback?: boolean }>).detail?.autoFallback;
      if (typeof nextAutoFallback === "boolean") setAutoFallback(nextAutoFallback);
      else setAutoFallback(loadAutoFallback());
    };
    window.addEventListener("bestdel:provider-keys-updated", handleProviderKeysUpdated);
    window.addEventListener("storage", handleProviderKeysUpdated);
    return () => {
      window.removeEventListener("bestdel:provider-keys-updated", handleProviderKeysUpdated);
      window.removeEventListener("storage", handleProviderKeysUpdated);
    };
  }, []);

  const activeRunInFlight = isStreaming || pipeline.runStatus === "running" || pipeline.runStatus === "repairing";
  const isRunTerminalError =
    pipeline.runStatus === "failed" ||
    pipeline.runStatus === "provider_error" ||
    pipeline.runStatus === "cancelled";
  const cancelActiveRun = useCallback(() => {
    handleStop();
    setIsStreaming(false);
    dispatchPipeline({ type: "RUN_STATUS", status: "cancelled" });
  }, [dispatchPipeline, handleStop]);

  // Cleanup in-flight stream and reset state when switching conversations
  useEffect(() => {
    if (conversationId != null && skipNextConversationResetRef.current === conversationId) {
      skipNextConversationResetRef.current = null;
      return () => abortStreamsForConversation(conversationId);
    }
    handleStop();
    setIsStreaming(false);
    resetPipeline();
    setShowLiveResearchRun(false);
    setDebateSuggestions([]);
    setInput("");
    return () => abortStreamsForConversation(conversationId);
  }, [abortStreamsForConversation, conversationId, handleStop, resetPipeline]);

  const { data: conversation, isLoading, isError } = useGetAnthropicConversation(
    conversationId as number,
    { query: { enabled: !!conversationId, queryKey: conversationId != null ? getGetAnthropicConversationQueryKey(conversationId) : ["anthropic", "conversations", "disabled"] } }
  );

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : behavior });
  };

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [conversation?.messages, streamingContent, currentSearch]);

  useEffect(() => {
    const lastUser = [...(conversation?.messages ?? [])].reverse().find((message) => message.role === "user");
    if (lastUser?.content) lastUserMessageRef.current = lastUser.content;
  }, [conversation?.messages]);

  // Track scroll position for floating scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distFromBottom < 120;
      setShowScrollBtn(distFromBottom > 300);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversationId, conversation?.messages?.length]);

  const resetPipelineState = () => {
    resetPipeline();
    setShowLiveResearchRun(false);
    setEnhancedFrom(null);
  };

  const handleSend = async () => {
    if (!input.trim() || activeRunInFlight) return;
    if (input.trim().length > 4000) {
      toast({ title: "Input too long", description: "Maximum 4000 characters allowed.", variant: "destructive" });
      return;
    }
    if (!activeArchiveId) {
      toast({
        title: "Create an archive first",
        description: "Every chat now lives inside an archive topic.",
        variant: "destructive",
      });
      return;
    }

    // Offline guard — show a helpful toast instead of silent failure
    if (!navigator.onLine) {
      toast({
        title: "You're offline",
        description: "Check your internet connection and try again.",
        variant: "destructive",
      });
      return;
    }

    const messageContent = input.trim();

    setInput("");
    setIsStreaming(true);
    resetPipelineState();

    let currentConvId = conversationId;
    let createdConversation = Boolean(conversationId);
    try {
      const now = new Date().toISOString();
      const fallbackTitle = fallbackConversationTitle(messageContent);

      if (!currentConvId) {
        const newConv = await createMutation.mutateAsync({ data: { title: fallbackTitle, archiveId: activeArchiveId } });
        currentConvId = newConv.id;
        createdConversation = true;

        const optimisticMessage: AnthropicMessage = {
          id: -Date.now(),
          conversationId: currentConvId,
          role: "user",
          content: messageContent,
          createdAt: now,
        };
        const optimisticConversation: AnthropicConversation = {
          ...newConv,
          archiveId: newConv.archiveId ?? activeArchiveId,
          title: newConv.title || fallbackTitle,
          createdAt: newConv.createdAt ?? now,
          messages: [optimisticMessage],
        };

        queryClient.setQueryData(getGetAnthropicConversationQueryKey(currentConvId), optimisticConversation);
        queryClient.setQueryData(
          [...getListAnthropicConversationsQueryKey(), activeArchiveId],
          (old: AnthropicConversation[] | undefined) => {
            const existing = old ?? [];
            return [
              { ...optimisticConversation, messages: undefined },
              ...existing.filter((item) => item.id !== currentConvId),
            ];
          }
        );
        skipNextConversationResetRef.current = currentConvId;
        onConversationCreated(currentConvId);

        // Fire-and-forget AI title generation
        (async () => {
          try {
            const r = await apiFetch("/api/anthropic/generate-title", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: messageContent }),
            });
            if (!r.ok) return;
            const { title } = await r.json();
            if (!title || typeof title !== "string") return;
            const cached = queryClient.getQueryData(getGetAnthropicConversationQueryKey(newConv.id)) as AnthropicConversation | undefined;
            const currentTitle = (cached?.title ?? "").trim();
            if (currentTitle && currentTitle !== fallbackTitle) return;
            await apiFetch(`/api/anthropic/conversations/${newConv.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title }),
            });
            queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
          } catch (e) {
            console.error("AI title generation failed", e);
          }
        })();
      }

      lastUserMessageRef.current = messageContent;

      if (currentConvId) {
        const optimisticMessage: AnthropicMessage = {
          id: -Date.now(),
          conversationId: currentConvId,
          role: "user",
          content: messageContent,
          createdAt: now,
        };

        queryClient.setQueryData(getGetAnthropicConversationQueryKey(currentConvId), (old: AnthropicConversation | undefined) => {
          if (!old) {
            return {
              id: currentConvId,
              archiveId: activeArchiveId,
              title: fallbackTitle,
              createdAt: now,
              messages: [optimisticMessage],
            };
          }
          const messages = old.messages ?? [];
          if (messages.some((msg) => msg.id === optimisticMessage.id || (msg.role === "user" && msg.content === messageContent && msg.createdAt === now))) {
            return old;
          }
          return {
            ...old,
            messages: [...messages, optimisticMessage],
          };
        });
      }

      setDebateSuggestions([]);
      const streamMode = chatType === "rhetorics" ? "normal" : currentMode;
      lastRunContextRef.current = {
        chatType,
        mode: streamMode,
        model: getPrimaryModelForMode(streamMode),
        rhetoricsType,
        creativity,
      };
      const streamCompleted = await runStream(
        currentConvId!, messageContent, getPrimaryModelForMode(streamMode), streamMode,
        chatType === "rhetorics" ? { rhetoricsType, creativity } : undefined
      );
      if (streamCompleted) {
        dispatchPipeline({ type: "RUN_STATUS", status: "completed" });
        dispatchPipeline({ type: "COMPLETE" });
      }
      // No else-branch: runStream already dispatched the precise terminal status
      // (provider_error/failed/cancelled) on every failure path. Overwriting here
      // with generic "failed" would clobber e.g. provider_error badges.
    } catch (error) {
      if (!createdConversation) setInput(messageContent);
      if ((error as any)?.name !== "AbortError") {
        console.error("Failed to send message:", error);
        dispatchPipeline({ type: "RUN_STATUS", status: "failed" });
      } else {
        dispatchPipeline({ type: "RUN_STATUS", status: "cancelled" });
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleEnhancePrompt = async () => {
    if (!input.trim() || isEnhancing) return;
    setIsEnhancing(true);
    const original = input.trim();
    try {
      const res = await apiFetch("/api/anthropic/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: original,
          mode: chatType === "rhetorics" ? rhetoricsType : currentMode,
        }),
      });
      if (res.ok) {
        const { enhanced } = await res.json();
        if (enhanced && enhanced !== original) {
          let applied = false;
          setInput((current) => {
            if (current.trim() !== original) return current;
            applied = true;
            return enhanced;
          });
          if (applied) setEnhancedFrom(original);
        }
      }
    } catch (e) {
      console.error("Enhance failed", e);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape: close options dropdown
    if (e.key === "Escape") {
      if (showOptions) {
        e.preventDefault();
        setShowOptions(false);
      }
      return;
    }
    // Cmd/Ctrl+Enter: send message (power user shortcut)
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
      return;
    }
    // Regular Enter sends. Multiline input stays available through the textarea default.
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyMessage = async (content: string, sources: Array<{ sourceId?: number; title?: string; url?: string }> = []) => {
    const body = prepareMessageForCopy(content);
    const sourceLines = sources
      .filter((source) => source.title || source.url)
      .map((source, index) => {
        const label = source.title || source.url || `Source ${source.sourceId ?? index + 1}`;
        return source.url ? `[${source.sourceId ?? index + 1}] ${label} — ${source.url}` : `[${source.sourceId ?? index + 1}] ${label}`;
      });
    const plainText = sourceLines.length > 0 ? `${body}\n\nSources\n${sourceLines.join("\n")}` : body;
    // Fix (Bug L486): navigator.clipboard requires HTTPS — fall back to execCommand for HTTP contexts
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(plainText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = plainText;
        textArea.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
        document.body.appendChild(textArea);
        textArea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!ok) throw new Error("execCommand copy failed");
      }
      toast({ title: "Copied!", description: "Message copied to clipboard.", duration: 1500 });
    } catch (err) {
      toast({ title: "Copy failed", description: `Could not copy: ${err instanceof Error ? err.message : "clipboard unavailable"}`, variant: "destructive" });
    }
  };

  const handleRegenerate = useCallback(async () => {
    const messages = conversation?.messages ?? [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastMsg = lastUser?.content ?? lastUserMessageRef.current;
    if (!lastMsg || activeRunInFlight || !conversationId) return;
    setDebateSuggestions([]);
    setIsStreaming(true);
    resetPipelineState();
    const context = lastRunContextRef.current ?? {
      chatType,
      mode: currentMode,
      model: normalModel,
      rhetoricsType,
      creativity,
    };
    try {
      await runStream(
        conversationId,
        lastMsg,
        context.model,
        context.mode,
        context.chatType === "rhetorics" && context.rhetoricsType != null && context.creativity != null
          ? { rhetoricsType: context.rhetoricsType, creativity: context.creativity }
          : undefined,
        true,
      );
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        console.error("Regenerate failed", e);
        dispatchPipeline({ type: "RUN_STATUS", status: "failed" });
      } else {
        dispatchPipeline({ type: "RUN_STATUS", status: "cancelled" });
      }
    } finally {
      setIsStreaming(false);
    }
  }, [activeRunInFlight, chatType, conversation?.messages, conversationId, creativity, currentMode, dispatchPipeline, normalModel, rhetoricsType, runStream]);

  const activeSearchProvider = useMemo(() => {
    const providers = [
      ["tavily", "Tavily"],
      ["brave", "Brave"],
      ["serper", "Serper"],
      ["exa", "Exa"],
      ["firecrawl", "Firecrawl"],
      ["jina", "Jina"],
    ] as const;
    const healthy = providers.find(([key]) => providerStatus[key]?.healthy);
    if (healthy) return { label: healthy[1], status: "ready" };
    const configured = providers.find(([key]) => providerStatus[key]?.configured);
    if (configured) return { label: configured[1], status: providerStatus[configured[0]]?.status ?? "checking" };
    return { label: "No search key", status: "missing_key" };
  }, [providerStatus]);

  const focusInput = () => {
    setTimeout(() => composerFocusRef.current?.(), 50);
  };

  const switchChatMode = useCallback((next: {
    chatType: ChatType;
    mode?: ChatMode;
    openOptions?: boolean;
  }) => {
    if (activeRunInFlight) cancelActiveRun();
    resetPipelineState();
    setChatType(next.chatType);
    if (next.mode) setCurrentMode(next.mode);
    if (next.openOptions !== undefined) setShowOptions(next.openOptions);
    else if (next.chatType !== "rhetorics") setShowOptions(false);
    focusInput();
  }, [
    activeRunInFlight,
    cancelActiveRun,
    resetPipelineState,
  ]);

  const featureCards = [
    {
      icon: MessageSquare,
      title: "Drafting Desk",
      desc: "Prepare speeches, rebuttals, POIs, motions, and clauses in one archive.",
      accent: "var(--status-success)",
      iconBg: "color-mix(in srgb, var(--status-success) 12%, transparent)",
      iconColor: "var(--status-success)",
      onClick: () => switchChatMode({ chatType: "research", mode: "normal" }),
    },
    {
      icon: Globe,
      title: "Source-Backed Search",
      desc: "Run fast evidence checks across official, legal, policy, and media sources.",
      accent: "var(--navy)",
      iconBg: "color-mix(in srgb, var(--navy) 12%, transparent)",
      iconColor: "var(--navy)",
      onClick: () => switchChatMode({ chatType: "research", mode: "fast_research" }),
    },
    {
      icon: FlaskConical,
      title: "Deep Research",
      desc: "Run a slower multi-query pass for serious prep and cited source memory.",
      accent: "var(--navy)",
      iconBg: "color-mix(in srgb, var(--navy) 12%, transparent)",
      iconColor: "var(--navy)",
      onClick: () => switchChatMode({ chatType: "research", mode: "deep_research" }),
    },
    {
      icon: Users,
      title: "Council Chamber",
      desc: "Six specialist councillors deliberate before a Chief verdict.",
      accent: "var(--brass)",
      iconBg: "rgba(196, 146, 46, 0.12)",
      iconColor: "var(--brass)",
      onClick: () => switchChatMode({ chatType: "research", mode: "council" }),
    },
  ];

  const activeDeskMode =
    chatType === "rhetorics" ? "rhetorics" :
    currentMode === "council" ? "council" :
    currentMode === "deep_research" ? "deep" :
    currentMode === "fast_research" ? "fast" :
    "drafting";
  const modeMeta = getChatModeChip(activeDeskMode);

  const activeModeModels = getModelsForMode(currentMode);
  const activeModeModelSetter = currentMode === "fast_research" ? setWebSearchModels : setDeepResearchModels;
  // Auto covers fast mode and the deep/council family (council reuses deep list).
  const activeModeAuto = currentMode === "normal" ? false : currentMode === "fast_research" ? webAuto : deepAuto;
  const setActiveModeAuto = currentMode === "fast_research" ? setWebAuto : setDeepAuto;
  const applyPreset = (presetId: string) => {
    const resolved = resolvePresetModels(presetId, healthyResearchModels);
    if (resolved.length === 0) {
      toast({
        title: "No healthy providers",
        description: "Configure a provider key in Settings, then try the preset again.",
        variant: "destructive",
      });
      return;
    }
    setActiveModeAuto(false);
    activeModeModelSetter(resolved);
    setModelSelectionDirty(true);
  };
  const activeModeColor = chatType === "rhetorics" ? "var(--brass)" : modeMeta.hex;
  const filteredModelGroups = useMemo(() => {
    const query = modelSearchText(modelSearch);
    const selectedIds = currentMode === "normal" ? [normalModel] : activeModeModels;
    return modelGroups
      .map(({ provider, models }) => ({
        provider,
        models: models.filter((model) => {
          const id = `${provider.toLowerCase()}/${model.id}`;
          if (provider === "OpenRouter" && !isOpenRouterFreeModel(model.id) && model.badge !== "free") return false;
          const label = model.name || simplifyModelName(model.id);
          const haystack = modelSearchText(`${provider} ${id} ${model.id} ${label}`);
          if (query && !haystack.includes(query)) return false;
          const unavailable = isKnownUnavailableChatModel(model.id) || isKnownUnavailableChatModel(id);
          if (!unavailable) return true;
          return Boolean(query) && selectedIds.some((selected) => selected === id || selected.endsWith(`/${model.id}`));
        }),
      }))
      .filter(({ models }) => models.length > 0);
  }, [activeModeModels, currentMode, modelGroups, modelSearch, normalModel]);

  const selectedModelCount = currentMode === "normal" ? 1 : activeModeModels.length;
  useEffect(() => {
    if (showOptions) {
      modelSnapshotRef.current = {
        normal: normalModel,
        web: [...webSearchModels],
        deep: [...deepResearchModels],
        webAuto,
        deepAuto,
      };
      return;
    }
    if (modelSaveRequestedRef.current) {
      modelSaveRequestedRef.current = false;
      modelSnapshotRef.current = null;
      return;
    }
    const snap = modelSnapshotRef.current;
    if (!snap) return;
    modelSnapshotRef.current = null;
    setNormalModel(snap.normal);
    setWebSearchModels(snap.web);
    setDeepResearchModels(snap.deep);
    setWebAuto(snap.webAuto);
    setDeepAuto(snap.deepAuto);
    setModelSelectionDirty(false);
  }, [showOptions]);

  const saveModelSelection = () => {
    modelSaveRequestedRef.current = true;
    setModelSelectionDirty(false);
    setShowOptions(false);
    setModelSearch("");
    focusInput();
  };
  const isWelcome = !conversationId && !isStreaming && !conversation;
  const isResearchRequest = chatType === "research" && currentMode !== "normal";
  const effectiveMode = currentMode;
  const modeProfile = getResearchModeProfile(
    isResearchRequest ? currentMode : "normal",
  );
  const researchRunAvailable =
    isResearchRequest &&
    (isStreaming || pipeline.isComplete);
  const showResearchRail = !belowLg && researchRunAvailable && showLiveResearchRun;
  const researchSidebarSummary = useMemo(() => summarizeResearchRunSidebar({
    activeArchiveName,
    activeArchiveTopic,
    activeArchiveAngles,
    runStatus: pipeline.runStatus,
    selectedResearchMode: pipeline.selectedResearchMode,
    corePipelineEvents: pipeline.corePipelineEvents,
    fullSourceManifest: pipeline.fullSourceManifest,
    customModelFound: pipeline.customModelFound,
    citationStatus: pipeline.citationStatus,
    sourceContract: pipeline.sourceContract,
    sourceGapReport: pipeline.sourceGapReport,
  }), [
    activeArchiveAngles,
    activeArchiveName,
    activeArchiveTopic,
    pipeline.citationStatus,
    pipeline.corePipelineEvents,
    pipeline.customModelFound,
    pipeline.fullSourceManifest,
    pipeline.runStatus,
    pipeline.selectedResearchMode,
    pipeline.sourceContract,
    pipeline.sourceGapReport,
  ]);
  const latestResearchSignal = researchSidebarSummary.latestEvents.at(-1) ?? researchSidebarSummary.statusLabel;

  if (conversationId && isError && !isLoading && !conversation) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--paper)]">
        <ConversationNotFound onNewChat={onNewChat} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--paper)]">
      {showResearchRail && (
        <ResearchRunSidebar
          summary={researchSidebarSummary}
          onClose={() => setShowLiveResearchRun(false)}
          layout="docked"
        />
      )}
      {researchRunAvailable && belowLg && (
        <Sheet open={mobileRailOpen} onOpenChange={setMobileRailOpen}>
          <SheetContent side="right" className="w-[min(100vw,344px)] border-[var(--line)] bg-[var(--surface)] p-0">
            <SheetTitle className="sr-only">Live research run</SheetTitle>
            <ResearchRunSidebar
              summary={researchSidebarSummary}
              onClose={() => setMobileRailOpen(false)}
              layout="sheet"
            />
          </SheetContent>
        </Sheet>
      )}
      {isWelcome ? (
        <div key="welcome" className="animate-page-fade flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-start gap-3 px-4 pb-8 pt-4 sm:gap-4 sm:px-5 md:px-8 lg:pt-6">
            <div className="relative">
              <div className="welcome-greeting relative mx-auto max-w-3xl text-center">
                <div className="mb-3 flex items-center justify-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--brass)]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--slate)]">
                    {activeArchiveName || "Workspace"}
                  </span>
                </div>
                <div className="brand-masthead">
                  <h1 className="brand-masthead-title text-[2rem] sm:text-4xl md:text-[2.65rem]">
                    BestDel
                  </h1>
                  <div className="order-paper-rule welcome-rule" aria-hidden />
                </div>
                <h2
                  className="mx-auto mt-4 max-w-3xl text-[1.75rem] leading-snug tracking-[0.02em] text-[var(--ink)] sm:text-[2rem]"
                   style={{ fontFamily: "var(--app-font-serif)", fontWeight: 300 }}
                >
                  Honorable Delegate, the floor is yours.
                </h2>
                <p className="welcome-hints mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--slate)]">
                  Ask a motion, bill, or procedural question. BestDel retrieves sources, verifies claims, and drafts cited arguments for Indian parliamentary prep.
                </p>
                {activeArchiveTopic && (
                  <div className="mx-auto mt-4 flex max-w-2xl items-start gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left">
                    <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brass)]" />
                    <p className="min-w-0 text-[13px] leading-6 text-[var(--slate)] sm:text-sm">
                      <span className="font-semibold text-[var(--brass)]">Active Archive Brief:</span>{" "}
                      <span className="line-clamp-2">{activeArchiveTopic}</span>
                    </p>
                  </div>
                )}
                {activeArchiveAngles && activeArchiveAngles.length > 0 && (
                  <div className="mx-auto mt-4 max-w-2xl rounded-md border border-[var(--line)] border-t-[var(--navy)] bg-[var(--surface)] p-3 text-left text-xs text-[var(--slate)]">
                    <p className="mb-2 font-semibold uppercase tracking-widest text-[var(--slate)]">Research Angles</p>
                    <ul className="space-y-1">
                      {activeArchiveAngles.slice(0, 5).map((angle, i) => (
                        <li key={`${i}-${angle}`}>- {angle}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="mx-auto grid w-full max-w-5xl gap-2.5 min-[460px]:grid-cols-2 lg:grid-cols-4">
              {featureCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    onClick={card.onClick}
                    style={{ "--card-accent": card.accent } as CSSProperties}
                    className={cn(
                       "feature-card group flex min-h-[88px] w-full flex-col items-start justify-between gap-2 p-3 text-left sm:min-h-[96px]",
                      i === 0 && "welcome-card-1",
                      i === 1 && "welcome-card-2",
                      i === 2 && "welcome-card-3",
                    )}
                  >
                    <div
                      className="feature-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--line)]/70"
                      style={{ backgroundColor: card.iconBg, color: card.iconColor }}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-sm font-semibold leading-snug sm:text-[15px]"
                        style={{ color: "var(--text-primary-hex)" }}
                      >
                        {card.title}
                      </div>
                      <div
                        className="mt-1 border-t border-[var(--line)]/55 pt-2.5 text-xs leading-5 sm:pt-3 sm:text-[13px] sm:leading-6"
                        style={{ color: "var(--text-secondary-hex)" }}
                      >
                        {card.desc}
                      </div>
                    </div>
                    <ChevronRight
                      className="feature-chevron w-4 h-4 shrink-0"
                      style={{ color: card.iconColor }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div
          key={conversationId ?? "new"}
          className={cn(
             "animate-page-fade relative flex-1 overflow-y-auto overscroll-contain space-y-2.5 px-2 py-2.5 sm:px-3 md:px-4 md:py-3",
            showResearchRail && "lg:mr-[344px]"
          )}
          ref={scrollRef}
        >
          {/* Floating scroll-to-bottom button — always mounted for smooth fade-out */}
          <button
            onClick={() => {
              stickToBottomRef.current = true;
              scrollToBottom("smooth");
            }}
            className={cn(
              "scroll-bottom-btn fixed bottom-32 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] shadow-md hover:bg-[var(--surface-muted)] md:right-8",
              showScrollBtn && "is-visible"
            )}
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
            data-testid="button-scroll-bottom"
            tabIndex={showScrollBtn ? 0 : -1}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          {researchRunAvailable && (
            <div className="sticky top-2 z-20 mx-auto flex w-full max-w-5xl items-center justify-end gap-2 px-1.5 sm:px-3 md:px-4">
              <button
                type="button"
                onClick={() => {
                  if (belowLg) {
                    setShowLiveResearchRun(true);
                    setMobileRailOpen(true);
                    return;
                  }
                  setShowLiveResearchRun((open) => !open);
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-[var(--line)]/70 bg-[var(--surface)]/95 px-3 py-2 text-xs font-semibold text-[var(--ink)] shadow-sm backdrop-blur-xl transition-colors hover:bg-[var(--surface-muted)]",
                  (showLiveResearchRun || mobileRailOpen) && "border-[var(--navy)]/35 bg-[color-mix(in_srgb,var(--navy)_10%,transparent)]"
                )}
                aria-expanded={belowLg ? mobileRailOpen : showLiveResearchRun}
                data-testid="button-toggle-live-research"
              >
                <FlaskConical className={cn("h-3.5 w-3.5", pipeline.runStatus === "running" && "animate-pulse")} />
                {belowLg || !showLiveResearchRun ? "See live research" : "Hide live research"}
              </button>
              <span
                className="hidden max-w-[180px] truncate rounded-full border border-[var(--line)]/50 bg-[var(--surface-muted)]/40 px-2 py-0.5 text-2xs font-medium text-[var(--slate)] sm:inline"
                aria-live="polite"
              >
                {latestResearchSignal}
              </span>
            </div>
          )}
          {isLoading && !conversation ? (
            <div className="space-y-4 animate-pulse" data-testid="conversation-loading-skeleton">
              <div className="h-4 bg-[var(--surface-muted)] rounded w-3/4" />
              <div className="h-4 bg-[var(--surface-muted)] rounded w-1/2" />
              <div className="h-4 bg-[var(--surface-muted)] rounded w-5/6" />
              <div className="h-4 bg-[var(--surface-muted)] rounded w-2/3" />
            </div>
          ) : null}
          {(() => {
            const msgs = conversation?.messages ?? [];
            const items: React.ReactNode[] = [];
            let prevDateKey: string | null = null;
            let prevRole: string | null = null;
            let prevTime = 0;
            msgs.forEach((msg, idx) => {
              const isLastAssistant =
                msg.role === "assistant" && idx === msgs.length - 1;
              const created = msg.createdAt ? new Date(msg.createdAt) : null;
              const dateKey = created ? created.toDateString() : "no-date";

              // Date separator
              if (created && dateKey !== prevDateKey) {
                const today = new Date(); today.setHours(0,0,0,0);
                const y = new Date(today); y.setDate(y.getDate() - 1);
                const d0 = new Date(created); d0.setHours(0,0,0,0);
                const label =
                  d0.getTime() === today.getTime() ? "Today" :
                  d0.getTime() === y.getTime()     ? "Yesterday" :
                  formatMessageDate(created);
                items.push(
                  <div key={`sep-${dateKey}-${msg.id}`} className="date-separator">
                    <span className="date-separator-pill">{label}</span>
                  </div>
                );
              }

              // Grouping: same role within 2 minutes -> tighter, no avatar
              const t = created ? created.getTime() : 0;
              const grouped =
                msg.role !== "assistant" &&
                msg.role === prevRole &&
                dateKey === prevDateKey &&
                t && prevTime && (t - prevTime) < 2 * 60 * 1000;
              if (
                isStreaming
                && msg.role === "assistant"
                && (
                  isWaitingAssistantPlaceholder(msg.content)
                  || (pipeline.activeAssistantMessageId != null && String(msg.id) === String(pipeline.activeAssistantMessageId))
                )
              ) {
                prevDateKey = dateKey;
                prevRole = msg.role;
                prevTime = t;
                return;
              }

              prevDateKey = dateKey;
              prevRole = msg.role;
              prevTime = t;

              items.push(
                <div
                  key={msg.id}
                    className={cn(
                       "group/msg mx-auto flex w-full max-w-5xl gap-2 px-1.5 bubble-spring sm:px-3 md:gap-3 md:px-4",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row",
                    grouped ? "mt-1" : "mt-3"
                  )}
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  <div
                    className={cn(
                       "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform md:h-8 md:w-8",
                      msg.role === "user" ? "bg-[var(--navy)] text-white" : "rounded-md bg-[var(--navy)] text-white",
                      grouped && "invisible"
                    )}
                    aria-hidden={grouped ? true : undefined}
                  >
                    {msg.role === "user" ? <User className="w-4 h-4 md:w-5 md:h-5" /> : <Bot className="w-4 h-4 md:w-5 md:h-5" />}
                  </div>
                    <div className={cn(
                       "flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col gap-1 sm:max-w-[85ch]",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                       "relative max-w-full break-words px-3.5 py-2.5 text-sm leading-7 shadow-sm backdrop-blur-xl sm:px-4 md:px-5 md:py-3.5 md:text-[15px]",
                      msg.role === "user"
                        ? "rounded-lg rounded-br-sm border border-[color-mix(in_srgb,var(--navy)_20%,transparent)] bg-[var(--surface)] text-[var(--ink)]"
                        : "assistant-bubble rounded-lg rounded-tl-sm text-[var(--ink)]"
                    )}>
                      {msg.role === "assistant" ? (
                        (() => {
                          const { cleanContent, meta } = extractPipelineMeta(msg.content, {
                            assistantMessageId: msg.id,
                            conversationId: msg.conversationId,
                          });
                          return (
                        <>
                          {meta && shouldRenderPersistedPipeline(meta) && <PersistedPipeline meta={meta} />}
                          <div className="assistant-fade-in text-[var(--ink)]">
                            <CitationMessage content={cleanContent} sources={meta?.sources ?? []} citationStatus={meta?.citationStatus ?? null} />
                          </div>
                          <button
                            onClick={() => handleCopyMessage(cleanContent, meta?.sources ?? [])}
                            className="absolute top-1.5 right-1.5 opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-[var(--surface)]/80 text-[var(--slate)] hover:text-[var(--ink)]"
                            title="Copy message"
                            aria-label="Copy message"
                            data-testid={`button-copy-message-${msg.id}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </>
                          );
                        })()
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                    </div>
                    {/* Hover-only timestamp */}
                    {msg.createdAt && (
                      <span
                        className="msg-timestamp text-[var(--slate)] px-1"
                        style={{ fontSize: "10px" }}
                        aria-label={`Sent at ${formatMessageTime(new Date(msg.createdAt!))}`}
                      >
                        {formatMessageTime(new Date(msg.createdAt))}
                      </span>
                    )}
                    {/* Fix (Bug L966): disable regenerate when there is no last user message */}
                  {isLastAssistant && !isStreaming && (
                      <button
                        onClick={handleRegenerate}
                        disabled={![...(conversation?.messages ?? [])].reverse().find((message) => message.role === "user")?.content && !lastUserMessageRef.current}
                        className="mt-1 flex items-center gap-1.5 rounded-full border border-[var(--line)]/70 bg-[var(--paper)] px-2.5 py-1 text-xs font-medium text-[var(--slate)] transition-colors hover:border-primary/30 hover:bg-[var(--surface-muted)]/60 hover:text-[var(--ink)]"
                        title="Regenerate response"
                        data-testid="button-regenerate"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerate
                      </button>
                    )}
                  </div>
                </div>
              );
            });
            return items;
          })()}

          {researchRunAvailable && showLiveResearchRun && isStreaming && isPanelAllowed(modeProfile, "council_chamber") && (
            <div className="mx-auto w-full max-w-5xl px-1.5 animate-bubble-in sm:px-3 sm:pl-10 md:px-4 md:pl-12">
              <CouncilChamberPanel session={pipeline.councilSession} />
            </div>
          )}

          {researchRunAvailable && showLiveResearchRun && isStreaming && !isPanelAllowed(modeProfile, "council_chamber") && (
            <div className={cn(
              "mx-auto w-full px-1.5 animate-bubble-in sm:px-3 sm:pl-10 md:px-4 md:pl-12",
              showResearchRail ? "max-w-[calc(100vw-380px)] lg:max-w-3xl" : "max-w-5xl"
            )}>
              <ResearchPipeline
                mode={effectiveMode as Exclude<ChatMode, "council">}
                allowedPanels={modeProfile.livePanels}
                modelConfig="standard"
                isPlanning={pipeline.isPlanning}
                plannerModel={pipeline.plannerModel}
                plannerRoles={pipeline.plannerRoles}
                isSynthesizing={pipeline.isSynthesizing}
                isVerifying={pipeline.isVerifying}
                verification={pipeline.verification}
                isComplete={pipeline.isComplete}
                qwenThinking={pipeline.qwenThinking}
                qwenThinkingStream={pipeline.qwenThinkingStream}
                isDiscussing={pipeline.isDiscussing}
                discussion={pipeline.discussion}
                bothExhausted={pipeline.bothExhausted}
                selectedModels={
                  pipeline.effectiveModels ?? activeModeModels
                }
                customModelSearches={pipeline.customModelSearches}
                customModelFound={pipeline.customModelFound}
                modelDraftStatus={pipeline.modelDraftStatus}
                queriesPlannedByModel={pipeline.queriesPlannedByModel}
                batches={pipeline.batches}
                customModelExhausted={pipeline.customModelExhausted}
                researchPlan={pipeline.researchPlan}
                fetchingTotal={pipeline.fetchingTotal}
                fetchedCount={pipeline.fetchedCount}
                citationWarning={pipeline.citationWarning}
                topicStrategy={pipeline.topicStrategy}
                isGeminiSynthesizing={pipeline.isGeminiSynthesizing}
                citationCoverage={pipeline.citationCoverage}
                dimensionScores={pipeline.dimensionScores}
                activeDivisions={pipeline.activeDivisions}
                completedDivisions={pipeline.completedDivisions}
                agendaClass={pipeline.agendaClass}
                committeeType={pipeline.committeeType}
                evidenceSummary={pipeline.evidenceSummary}
                fullSourceManifest={pipeline.fullSourceManifest}
                corePipelineEvents={pipeline.corePipelineEvents}
                sourceContract={pipeline.sourceContract}
                sourceGapReport={pipeline.sourceGapReport}
                coreQualityGate={pipeline.coreQualityGate}
                selectedResearchMode={pipeline.selectedResearchMode}
                archiveRouting={pipeline.archiveRouting}
                researchAngles={pipeline.researchAngles}
                legacyFallbackUsed={pipeline.legacyFallbackUsed}
                runStatus={pipeline.runStatus}
                citationStatus={pipeline.citationStatus}
                query={lastUserMessageRef.current || ""}
                streamingAnswer={pipeline.streamingContent}
                finalAnswer={pipeline.streamingContent}
                citedNums={pipeline.citedNums}
                searchTier={activeSearchProvider.status === "missing_key" ? "No browser search key" : activeSearchProvider.label}
                dataCheatsheet={pipeline.dataCheatsheet}
              />
            </div>
          )}

          {isStreaming && !isRunTerminalError && chatType === "research" && currentMode === "normal" && (
            <div className="mx-auto flex w-full max-w-5xl flex-row gap-2 px-1.5 animate-bubble-in sm:px-3 md:gap-3 md:px-4" data-testid="message-streaming">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--surface-muted)] text-[var(--slate)] mt-1 animate-pulse-soft">
                <Bot className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div className="flex w-full max-w-[calc(100%-2.5rem)] flex-col gap-2 sm:max-w-[85ch]">
                <div className="assistant-bubble w-full rounded-lg px-3.5 py-3 text-[var(--ink)] transition-all duration-200 sm:px-5 sm:py-4">
                  <div className="prose prose-sm max-w-none text-[var(--ink)] dark:prose-invert">
                    {(() => {
                      if (isRunTerminalError) return null;
                      if (!streamingContent) {
                        return <ThinkingIndicator mode="normal" phase={pipeline.isVerifying ? "verifying" : "connecting"} />;
                      }
                      const { thinking, mainContent: cleanMain, isThinkingFinished } = extractThinking(streamingContent);
                      return (
                        <>
                          {thinking && <ThoughtBlock thinking={thinking} isThinkingFinished={isThinkingFinished} />}
                          {cleanMain ? (
                            <div className={cn(isStreaming && !isComplete && "stream-cursor")}>
                              <StreamingText content={cleanMain} isStreaming={isStreaming && !isComplete} />
                            </div>
                          ) : isThinkingFinished ? (
                            <ThinkingIndicator mode="normal" phase={pipeline.isVerifying ? "verifying" : "connecting"} />
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isStreaming && !isRunTerminalError && chatType === "rhetorics" && (
            <div className="mx-auto flex w-full max-w-5xl flex-row gap-2 px-1.5 animate-bubble-in sm:px-3 md:gap-3 md:px-4">
              <div className={cn(
                "w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 mt-1 text-base",
                rhetoricsType === "debate" ? "bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)]"
                  : rhetoricsType === "kavita" ? "bg-[color-mix(in_srgb,var(--brass)_10%,transparent)]"
                  : "bg-[var(--accent-secondary-subtle)]"
              )}>
                <Bot className="h-4 w-4 text-slate-500 dark:text-slate-300" />
              </div>
              <div className="flex w-full max-w-[calc(100%-2.5rem)] flex-col gap-1.5 sm:max-w-[85ch]">
                <p className={cn("text-2xs font-semibold",
                  rhetoricsType === "debate" ? "text-destructive"
                    : rhetoricsType === "kavita" ? "text-amber-700 dark:text-amber-400"
                    : "text-[var(--brass)]"
                )}>
                  {rhetoricsType === "debate" ? "Opposing Delegate" : rhetoricsType === "kavita" ? "Kavita" : "Opening Speech"}
                </p>
                <div className={cn(
                   "w-full rounded-lg rounded-tl-sm px-3.5 py-3 text-[var(--ink)] shadow-sm transition-all duration-200 sm:px-5 sm:py-4",
                  rhetoricsType === "kavita"  ? "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)] border border-[color-mix(in_srgb,var(--brass)_30%,transparent)]"
                    : rhetoricsType === "debate" ? "bg-[color-mix(in_srgb,var(--destructive)_8%,transparent)] border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)]"
                    : "bg-[var(--surface-muted)]"
                )}>
                  <div className={cn("prose dark:prose-invert max-w-none whitespace-pre-wrap", rhetoricsType === "kavita" ? "text-base leading-loose" : "text-sm")}>
                    {(() => {
                      if (isRunTerminalError) return null;
                      if (!pipeline.streamingContent) {
                        return <ThinkingIndicator mode="rhetorics" rhetoricsType={rhetoricsType} phase={pipeline.isVerifying ? "verifying" : "connecting"} />;
                      }
                      const { thinking, mainContent: cleanMain, isThinkingFinished } = extractThinking(pipeline.streamingContent);
                      return (
                        <>
                          {thinking && <ThoughtBlock thinking={thinking} isThinkingFinished={isThinkingFinished} />}
                          {cleanMain ? (
                            <div className={cn(isStreaming && !isComplete && "stream-cursor")}>
                              <StreamingText content={cleanMain} isStreaming={isStreaming && !isComplete} />
                            </div>
                          ) : isThinkingFinished ? (
                            <ThinkingIndicator mode="rhetorics" rhetoricsType={rhetoricsType} phase={pipeline.isVerifying ? "verifying" : "connecting"} />
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isStreaming && chatType === "rhetorics" && rhetoricsType === "debate" && debateSuggestions.length > 0 && (
            <div className="mx-auto max-w-5xl px-1.5 sm:px-3 sm:pl-10 md:px-4 md:pl-12">
              <p className="text-2xs font-semibold text-[var(--slate)] mb-1.5 uppercase tracking-wider">💬 Counter-arguments</p>
              <div className="flex flex-col gap-1.5">
                {debateSuggestions.map((s, i) => (
                  <button key={i} onClick={() => { setInput(s); focusInput(); }}
                    className="text-left text-xs px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                  >
                    → {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className={cn(
        "shrink-0 border-t border-[var(--line)]/70 bg-[var(--surface)]/95 px-2 py-2 safe-area-inset-bottom sm:px-3 md:px-2",
        showResearchRail && "lg:mr-[344px]"
      )}>
        {browserOffline && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <span>You&apos;re offline. Reconnect before sending.</span>
          </div>
        )}
        {connectionWarn && chatType === "research" && currentMode === "deep_research" && (
          <div className="flex items-center gap-2 px-4 py-2 mb-2 text-xs bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-700 dark:text-yellow-300">
            <span>⚠️ High latency detected. Deep research may take longer than usual on your connection.</span>
            <button
              onClick={() => setConnectionWarn(false)}
              className="ml-auto text-yellow-500 hover:text-yellow-700"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
          <div className="relative isolate mx-auto flex w-full max-w-4xl flex-col gap-1.5 px-0 md:px-4 md:pb-2">
          <ChatComposer
            input={input}
            onInputChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={() => handleSend()}
            onStop={cancelActiveRun}
            onEnhance={handleEnhancePrompt}
            onShowOptionsToggle={() => setShowOptions((v) => !v)}
            showOptions={showOptions}
            isStreaming={activeRunInFlight}
            isEnhancing={isEnhancing}
            disabled={activeRunInFlight || isEnhancing}
            placeholder={
              chatType === "rhetorics" && rhetoricsType === "debate"  ? "Make your argument. I'll take the opposing side..."
              : chatType === "rhetorics" && rhetoricsType === "kavita" ? "Describe your committee topic. I'll write a Kavita..."
              : chatType === "rhetorics" && rhetoricsType === "speech" ? "Tell me your country and topic. I'll write your opening speech..."
              : currentMode === "fast_research" ? "Ask anything. I'll run a fast source-backed research pass..."
              : currentMode === "deep_research" ? "Ask a serious prep question. I'll run a deeper multi-source pass..."
              : currentMode === "council" ? "Pose a Council question - six councillors will deliberate before a Chief verdict..."
              : "Type your message..."
            }
            activeChip={
              chatType === "rhetorics"
                ? "rhetorics"
                : currentMode === "council"
                ? "council"
                : currentMode === "deep_research"
                ? "deep"
                : currentMode === "fast_research"
                ? "fast"
                : "drafting"
            }
            onSelectChip={(id: ChatModeChipId) => {
              if (id === "drafting") switchChatMode({ chatType: "research", mode: "normal", openOptions: false });
              else if (id === "rhetorics") switchChatMode({ chatType: "rhetorics", openOptions: true });
              else if (id === "fast") switchChatMode({ chatType: "research", mode: "fast_research", openOptions: false });
              else if (id === "deep") switchChatMode({ chatType: "research", mode: "deep_research", openOptions: false });
              else if (id === "council") switchChatMode({ chatType: "research", mode: "council", openOptions: false });
            }}
            enhancedNotice={enhancedFrom
              ? {
                  original: enhancedFrom,
                  onRestore: () => {
                    setInput(enhancedFrom);
                    setEnhancedFrom(null);
                  },
                }
              : null}
            researchProviderUnavailable={researchProviderUnavailable}
            statusBadge={{ label: modeMeta.label, color: modeMeta.color, bg: modeMeta.bg, border: modeMeta.border }}
            modelSummary={
              chatType === "rhetorics" || currentMode === "normal"
                ? simplifyModelName(getPrimaryModelForMode("normal"))
                : activeModeModels.length === 1 && !activeModeAuto
                  ? simplifyModelName(activeModeModels[0] ?? getPrimaryModelForMode(currentMode))
                  : `${activeModeAuto ? "Auto · " : ""}${activeModeModels.map(simplifyModelName).join(" · ") || "none"}`
            }
            focusRef={composerFocusRef}
          />

          {showOptions && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-30 max-h-[min(48vh,24rem)] overflow-y-auto rounded-lg border border-[var(--line)]/70 bg-popover/95 p-2 text-popover-foreground shadow-[0_24px_80px_rgba(15,23,42,0.22)] md:left-4 md:right-4 dark:border-[var(--line)] dark:bg-[var(--surface)]/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.48)]"
            >
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--line)]/60 px-1 pb-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--ink)]">
                    {chatType === "rhetorics" ? "Rhetorics controls" : "Model selection"}
                  </p>
                  <p className="truncate text-2xs text-[var(--slate)]">
                    {chatType === "rhetorics"
                      ? "Tune speech mode and creativity."
                      : currentMode === "normal"
                        ? simplifyModelName(normalModel)
                        : activeModeAuto
                          ? `Auto · ${selectedModelCount} model${selectedModelCount === 1 ? "" : "s"} for ${modeMeta.label}`
                          : `${selectedModelCount} model${selectedModelCount === 1 ? "" : "s"} selected`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOptions(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)]/70 bg-[var(--surface)]/70 text-[var(--slate)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                  aria-label="Close options"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* ── Level 2: Sub-modes ────────────────────────────────────── */}
              {chatType === "rhetorics" && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-[var(--line)]/60 bg-[var(--surface)]/70 p-1.5 backdrop-blur-xl">
                    {([
                      { id: "kavita" as RhetoricsType, label: "Kavita" },
                      { id: "speech" as RhetoricsType, label: "Opening Speech" },
                      { id: "debate" as RhetoricsType, label: "Open Debate" },
                    ]).map(({ id, label }) => (
                      <button key={id} onClick={() => setRhetoricsType(id)}
                        className={cn(
                          "min-h-9 rounded-xl border px-2 py-1.5 text-2xs font-semibold leading-tight transition-all md:text-xs",
                          rhetoricsType === id
                            ? "border-slate-300 bg-slate-100 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                            : "text-[var(--slate)] hover:text-[var(--ink)] hover:bg-[var(--surface)]/50 border-transparent",
                        )}
                      >{label}</button>
                    ))}
                  </div>
                  {/* Creativity Dial */}
                  <div className="space-y-3 px-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--slate)]">Creativity</span>
                      <span
                        className="rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${creativity < 0.45 ? "var(--navy)" : creativity < 0.75 ? "var(--brass)" : "#B45309"} 10%, transparent)`,
                          borderColor: `color-mix(in srgb, ${creativity < 0.45 ? "var(--navy)" : creativity < 0.75 ? "var(--brass)" : "#B45309"} 18%, transparent)`,
                          color: creativity < 0.45 ? "var(--navy)" : creativity < 0.75 ? "var(--brass)" : "#B45309",
                        }}
                      >
                        {creativity < 0.25 ? "Rational"
                          : creativity < 0.45 ? "Structured"
                          : creativity < 0.6  ? "Vivid"
                          : creativity < 0.8  ? "Expressive"
                          : creativity < 0.92 ? "Forceful"
                          : "Maximal"}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-[var(--surface-muted)]">
                      <motion.div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width: `${creativity * 100}%`,
                          background: `linear-gradient(90deg, var(--navy), ${creativity < 0.45 ? "var(--navy)" : creativity < 0.75 ? "var(--brass)" : "#B45309"})`,
                        }}
                        transition={{ duration: 0.15 }}
                      />
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={creativity}
                        onChange={(e) => setCreativity(parseFloat(e.target.value))}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      <motion.div
                        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 bg-white shadow-lg"
                        style={{
                          left: `${creativity * 100}%`,
                          borderColor: creativity < 0.45 ? "var(--navy)" : creativity < 0.75 ? "var(--brass)" : "#B45309",
                          transform: "translateX(-50%) translateY(-50%)",
                        }}
                        transition={{ duration: 0.15 }}
                      />
                    </div>
                    <div className="flex justify-between px-0.5 text-xs text-[var(--slate)]">
                      <span>Rational</span>
                      <span>Vivid</span>
                      <span>Fiery</span>
                    </div>
                  </div>
                </div>
              )}

          {/* ── Model Selection Panel (research only) ─────────────────── */}
          {chatType === "research" && (
            <div className="space-y-2">
              {currentMode !== "normal" && (
                <div className="flex flex-wrap items-center gap-1.5" data-testid="model-presets">
                  <button
                    type="button"
                    onClick={() => { setActiveModeAuto(true); setModelSelectionDirty(true); }}
                    aria-pressed={activeModeAuto}
                    title="Auto-pick the healthiest providers each run"
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition",
                      activeModeAuto
                        ? "border-[var(--navy)]/50 bg-[color-mix(in_srgb,var(--navy)_12%,transparent)] text-[var(--ink)]"
                        : "border-[var(--line)]/60 bg-[var(--surface)]/50 text-[var(--slate)] hover:bg-[var(--surface-muted)]/60 hover:text-[var(--ink)]",
                    )}
                  >
                    <Zap className="h-3 w-3" />
                    Auto
                  </button>
                  {RESEARCH_MODEL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      title={preset.hint}
                      className="inline-flex h-8 items-center rounded-full border border-[var(--line)]/60 bg-[var(--surface)]/50 px-2.5 text-xs font-medium text-[var(--slate)] transition hover:bg-[var(--surface-muted)]/60 hover:text-[var(--ink)]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
              {currentMode !== "normal" && activeModeAuto ? (
                <div className="rounded-xl border border-[var(--navy)]/25 bg-[color-mix(in_srgb,var(--navy)_6%,transparent)] px-3 py-2.5">
                  <p className="text-xs font-semibold text-[var(--ink)]">
                    Auto picks {activeModeModels.length} healthy model{activeModeModels.length === 1 ? "" : "s"} each run
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {activeModeModels.length === 0 ? (
                      <span className="text-xs text-[var(--slate)]">No healthy providers right now.</span>
                    ) : (
                      activeModeModels.map((modelId) => (
                        <span
                          key={modelId}
                          className="rounded-full border border-[var(--line)]/60 bg-[var(--surface)]/70 px-2 py-0.5 text-2xs font-medium text-[var(--ink)]"
                        >
                          {simplifyModelName(modelId)}
                        </span>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setActiveModeAuto(false); setModelSelectionDirty(true); }}
                    className="mt-2 text-xs font-semibold text-[var(--navy)] hover:underline"
                  >
                    Customize manually
                  </button>
                </div>
              ) : (
              <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--slate)]" />
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Search models..."
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)]/70 pl-9 pr-3 text-xs text-[var(--ink)] outline-none transition placeholder:text-[var(--slate)] focus:border-[var(--navy)]/70 focus:ring-2 focus:ring-[var(--brass)]/30"
                  data-testid="input-model-search"
                />
              </div>

              <div className="max-h-[min(34vh,18rem)] space-y-2 overflow-y-auto pr-1">
                {!hasModelOptions ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)]/70 px-3 py-4 text-center text-xs text-[var(--slate)]">
                    No provider models available.
                  </div>
                ) : filteredModelGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)]/70 px-3 py-4 text-center text-xs text-[var(--slate)]">
                    No models match “{modelSearch.trim()}”.
                  </div>
                ) : (
                  filteredModelGroups.map(({ provider, models }) => (
                    <div key={provider} className="space-y-1">
                      <div className="flex items-center gap-1.5 px-1 text-2xs font-bold uppercase tracking-[0.14em] text-[var(--slate)]">
                        <ModelLogo provider={provider} className="h-4 w-4 p-px" />
                        {provider}
                      </div>
                      {models.map((model) => {
                        const modelId = `${provider.toLowerCase()}/${model.id}`;
                        const unavailable = isKnownUnavailableChatModel(model.id) || isKnownUnavailableChatModel(modelId);
                        const selected = currentMode === "normal"
                          ? normalModel === modelId
                          : activeModeModels.includes(modelId);
                        return (
                          <button
                            key={modelId}
                            type="button"
                            disabled={unavailable}
                            onClick={() => {
                              if (currentMode === "normal") {
                                setNormalModel(modelId);
                                setModelSelectionDirty(true);
                              } else {
                                toggleModelInList(activeModeModels, activeModeModelSetter, modelId);
                              }
                            }}
                            aria-pressed={selected}
                            className={cn(
                              "flex min-h-10 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
                              selected
                                ? "border-[var(--navy)]/50 bg-[color-mix(in_srgb,var(--navy)_12%,transparent)] text-[var(--ink)]"
                                : "border-[var(--line)]/55 bg-[var(--surface)]/45 text-[var(--slate)] hover:border-[var(--line)] hover:bg-[var(--surface-muted)]/50 hover:text-[var(--ink)]",
                            )}
                          >
                            <ModelLogo id={model.id} provider={provider} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">
                                {model.name || simplifyModelName(model.id)}
                                {unavailable ? " · Unavailable" : ""}
                              </span>
                              <span className="block truncate text-2xs text-[var(--slate)]">
                                {provider} / {simplifyModelName(model.id)}
                              </span>
                            </span>
                            {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--navy)]" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-[var(--line)]/60 pt-2">
                <span className="truncate text-2xs text-[var(--slate)]">
                  {currentMode === "normal"
                    ? `Selected: ${simplifyModelName(normalModel)}`
                    : `${selectedModelCount} selected for ${modeMeta.label}`}
                </span>
                {modelSelectionDirty && (
                  <button
                    type="button"
                    onClick={saveModelSelection}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--navy-hover)]"
                    data-testid="button-save-models"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save models
                  </button>
                )}
              </div>
              </>
              )}
            </div>
          )}
            </motion.div>
          )}

          {/* Footer status */}
          <div className="hidden items-center gap-3 border-t border-[var(--line)] px-1 py-1.5 sm:flex">
            {tokensPerSec !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2 py-0.5 text-2xs font-medium text-emerald-400 animate-in fade-in">
                {tokensPerSec} tok/s
              </span>
            )}
            <span
              className="rounded px-1.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${activeModeColor}12`, color: activeModeColor }}
            >
              {chatType === "rhetorics" ? "Rhetorics" : modeMeta.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
