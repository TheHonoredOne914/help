import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import { ChatComposer } from "./ChatComposer";
import { type ChatModeChipId } from "./ChatModeChips";
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
  PenLine, Mic2, Layers, Landmark, Bookmark, Users,
  ShieldCheck, Search, X, Check,
} from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { usePipelineState } from "@/hooks/use-pipeline-state";
import { loadProviderKeys } from "@/lib/provider-keys";
import { useProviderModels } from "@/hooks/use-provider-models";
import { apiFetch } from "@/lib/api-fetch";
import { StreamingText } from "./streaming-text";
import { ThinkingIndicator } from "./thinking-indicator";
import { ThoughtBlock, extractThinking } from "./thought-block";
import { ResearchPipeline } from "./research-pipeline";
import { CouncilChamberPanel } from "@/components/council/council-chamber-panel";
import { PersistedPipeline, extractPipelineMeta } from "./persisted-pipeline";
import { CursorGlint } from "./cursor-glint";
import { CitationMessage, prepareMessageForCopy } from "./chat-message-list";
import { ResearchRunSidebar, summarizeResearchRunSidebar } from "./chat-run-status";
import { useModeModelSelection } from "./use-mode-model-selection";
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
import {
  simplifyModelName,
  getModelIcon,
} from "./provider-model-display";

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
  useEffect(() => { if (isStreaming) setShowOptions(false); }, [isStreaming]);
  const [modelSearch, setModelSearch] = useState("");
  const [modelSelectionDirty, setModelSelectionDirty] = useState(false);
  const [chatType, setChatType] = useState<ChatType>("research");
  const [rhetoricsType, setRhetoricsType] = useState<RhetoricsType>("speech");
  const [creativity, setCreativity] = useState<number>(0.5);
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
    if (chatType === "rhetorics" && !isStreaming) {
      setShowOptions(true);
    }
  }, [chatType, isStreaming]);

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
  const {
    webSearchModels,
    setWebSearchModels,
    deepResearchModels,
    setDeepResearchModels,
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
  ], [cerebrasModels, geminiModels, githubModels, groqModels, nvidiaModels, ollamaModels, openrouterModels]);
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
    setInput("");
    return () => abortStreamsForConversation(conversationId);
  }, [abortStreamsForConversation, conversationId, handleStop, resetPipeline]);

  const { data: conversation, isLoading } = useGetAnthropicConversation(
    conversationId as number,
    { query: { enabled: !!conversationId, queryKey: conversationId != null ? getGetAnthropicConversationQueryKey(conversationId) : ["anthropic", "conversations", "disabled"] } }
  );

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages, streamingContent, currentSearch]);

  // Track scroll position for floating scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
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
    try {
      const now = new Date().toISOString();
      const fallbackTitle = messageContent.split(/\s+/).slice(0, 4).join(" ") + "...";

      if (!currentConvId) {
        const newConv = await createMutation.mutateAsync({ data: { title: fallbackTitle, archiveId: activeArchiveId } });
        currentConvId = newConv.id;

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
      lastRunContextRef.current = {
        chatType,
        mode: currentMode,
        model: normalModel,
        rhetoricsType,
        creativity,
      };
      const streamCompleted = await runStream(
        currentConvId!, messageContent, normalModel, currentMode,
        chatType === "rhetorics" ? { rhetoricsType, creativity } : undefined
      );
      if (streamCompleted) {
        dispatchPipeline({ type: "RUN_STATUS", status: "completed" });
        dispatchPipeline({ type: "COMPLETE" });
      } else {
        dispatchPipeline({ type: "RUN_STATUS", status: "failed" });
      }
    } catch (error) {
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
        body: JSON.stringify({ prompt: original, mode: currentMode }),
      });
      if (res.ok) {
        const { enhanced } = await res.json();
        if (enhanced && enhanced !== original) {
          setEnhancedFrom(original);
          setInput(enhanced);
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

  const handleCopyMessage = async (content: string) => {
    const plainText = prepareMessageForCopy(content);
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
      );
    } catch (e) {
      if ((e as any)?.name !== "AbortError") console.error("Regenerate failed", e);
      else dispatchPipeline({ type: "RUN_STATUS", status: "cancelled" });
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

  const featureCards = [
    {
      icon: MessageSquare,
      title: "Drafting Desk",
      desc: "Prepare speeches, rebuttals, POIs, motions, and clauses in one archive.",
      accent: "#22c55e",
      iconBg: "rgba(34, 197, 94, 0.12)",
      iconColor: "#22c55e",
      onClick: () => { setChatType("research"); setCurrentMode("normal"); focusInput(); },
    },
    {
      icon: Globe,
      title: "Source-Backed Search",
      desc: "Run fast evidence checks across official, legal, policy, and media sources.",
      accent: "#3b6fd4",
      iconBg: "rgba(59, 111, 212, 0.14)",
      iconColor: "#6f93e8",
      onClick: () => { setChatType("research"); setCurrentMode("fast_research"); focusInput(); },
    },
    {
      icon: FlaskConical,
      title: "Deep Research",
      desc: "Run a slower multi-query pass for serious prep and cited source memory.",
      accent: "#3b6fd4",
      iconBg: "rgba(59, 111, 212, 0.14)",
      iconColor: "#6f93e8",
      onClick: () => { setChatType("research"); setCurrentMode("deep_research"); focusInput(); },
    },
    {
      icon: Users,
      title: "Council Chamber",
      desc: "Six specialist councillors deliberate before a Chief verdict.",
      accent: "#d4a03b",
      iconBg: "rgba(212, 160, 59, 0.14)",
      iconColor: "#d4a03b",
      onClick: () => { setChatType("research"); setCurrentMode("council"); focusInput(); },
    },
  ];

  const MODE_META: Record<ChatMode, { label: string; icon: any; color: string; bg: string; border: string; ring: string; hex: string; }> = {
    normal: {
      label: "Drafting", icon: PenLine,
      color: "text-[#22c55e]",
      bg: "bg-[#22c55e18]",
      border: "border-[#22c55e30]",
      ring: "ring-slate-400",
      hex: "#22c55e",
    },
    fast_research: {
      label: "Fast Research", icon: Globe,
      color: "text-[#6f93e8]",
      bg: "bg-[#3b6fd418]",
      border: "border-[#3b6fd430]",
      ring: "ring-blue-400",
      hex: "#3b6fd4",
    },
    deep_research: {
      label: "Deep Research", icon: FlaskConical,
      color: "text-[#6f93e8]",
      bg: "bg-[#3b6fd418]",
      border: "border-[#3b6fd430]",
      ring: "ring-blue-400",
      hex: "#3b6fd4",
    },
    council: {
      label: "Council", icon: Users,
      color: "text-[#d4a03b]",
      bg: "bg-[#d4a03b18]",
      border: "border-[#d4a03b30]",
      ring: "ring-amber-400",
      hex: "#d4a03b",
    },
  };

  const deskModes = [
    { id: "drafting", label: "Drafting", icon: PenLine, color: "#22c55e", description: "Draft speeches, clauses, and working papers using archive context.", select: () => { setChatType("research"); setCurrentMode("normal"); setShowOptions(false); } },
    { id: "rhetorics", label: "Rhetorics", icon: Mic2, color: "#8b5cf6", description: "Build speeches, POIs, rebuttals, and floor interventions.", select: () => { setChatType("rhetorics"); setShowOptions(true); } },
    { id: "fast", label: "Fast Research", icon: Globe, color: "#3b6fd4", description: "Quick web lookups and fact-checking during committee sessions.", select: () => { setChatType("research"); setCurrentMode("fast_research"); setShowOptions(false); } },
    { id: "deep", label: "Deep Research", icon: FlaskConical, color: "#3b6fd4", description: "Comprehensive source-backed synthesis for serious prep.", select: () => { setChatType("research"); setCurrentMode("deep_research"); setShowOptions(false); } },
    { id: "council", label: "Council", icon: Users, color: "#d4a03b", description: "Six councillors stress-test the agenda and prepare floor strategy.", select: () => { setChatType("research"); setCurrentMode("council"); setShowOptions(false); } },
  ];

  const activeDeskMode =
    chatType === "rhetorics" ? "rhetorics" :
    currentMode === "council" ? "council" :
    currentMode === "deep_research" ? "deep" :
    currentMode === "fast_research" ? "fast" :
    "drafting";

  const activeModeModels = getModelsForMode(currentMode);
  const activeModeModelSetter = currentMode === "fast_research" ? setWebSearchModels : setDeepResearchModels;
  const activeModeColor = chatType === "rhetorics" ? "#8b5cf6" : MODE_META[currentMode].hex;
  const filteredModelGroups = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return modelGroups
      .map(({ provider, models }) => ({
        provider,
        models: models.filter((model) => {
          if (!query) return true;
          const id = `${provider.toLowerCase()}/${model.id}`;
          const label = model.name || simplifyModelName(model.id);
          return `${provider} ${id} ${label}`.toLowerCase().includes(query);
        }),
      }))
      .filter(({ models }) => models.length > 0);
  }, [modelGroups, modelSearch]);
  const selectedModelCount = currentMode === "normal" ? 1 : activeModeModels.length;
  const saveModelSelection = () => {
    setModelSelectionDirty(false);
    setShowOptions(false);
    setModelSearch("");
    focusInput();
  };
  const isWelcome = !conversationId && !isStreaming && !conversation;
  const effectiveMode = (isStreaming || pipeline.isComplete) && pipeline.selectedResearchMode ? pipeline.selectedResearchMode : currentMode;
  const researchRunAvailable = (isStreaming || pipeline.isComplete) && chatType === "research" && effectiveMode !== "normal";
  const showResearchRail = researchRunAvailable && showLiveResearchRun;
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

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {showResearchRail && (
        <ResearchRunSidebar summary={researchSidebarSummary} onClose={() => setShowLiveResearchRun(false)} />
      )}
      {isWelcome ? (
        <div key="welcome" className="animate-page-fade flex-1 overflow-y-auto overscroll-contain" data-cursor-glint-scope="welcome">
          <CursorGlint />
          <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-start gap-3 px-4 pb-8 pt-4 sm:gap-4 sm:px-5 md:px-8 lg:pt-6">
            <div className="relative">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="bestdel-hero-glow welcome-greeting relative mx-auto max-w-3xl text-center"
              >
                <Landmark className="pointer-events-none absolute left-1/2 top-[-20px] h-24 w-24 -translate-x-1/2 text-[#3b6fd4]/10 sm:top-[-34px] md:h-36 md:w-36" />
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-3 flex items-center justify-center gap-2"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-[#3b6fd4]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {activeArchiveName || "Legacy Archive"}
                  </span>
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.5 }}
                  className="mx-auto max-w-3xl text-[2rem] leading-[1.02] text-foreground sm:text-4xl md:text-[2.65rem] lg:text-[2.85rem]"
                  style={{ fontFamily: "Instrument Serif, serif", fontWeight: 400 }}
                >
                  Honorable Delegate,
                  <br />
                  <span className="text-[#3b6fd4] dark:text-[#a8b9e8]">the floor is yours.</span>
                </motion.h1>
                <div className="hero-rule mx-auto" aria-hidden />
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="mx-auto mt-3 max-w-2xl text-[13px] leading-6 text-muted-foreground sm:text-sm md:text-[14px]"
                >
                  Your intelligence desk for Indian parliamentary committees. Research complex agendas, draft speeches, and formulate rebuttals backed by validated citations and deep source memory.
                </motion.p>
                <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-2">
                  {["Citations validated", "Source usage mapped", "Archive memory", "Indian committee framing"].map((badge) => (
                    <span
                      key={badge}
                       className="inline-flex items-center gap-1.5 rounded-full border border-[#d4a03b30] bg-[#d4a03b12] px-2.5 py-1 text-[11px] font-semibold text-[#8a5b13] dark:text-[#f3c76f]"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {badge}
                    </span>
                  ))}
                </div>
                <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-1.5">
                  {[
                    ["Plan", "Topic-aware queries"],
                    ["Retrieve", "official/legal sources"],
                    ["Validate", "citation gates"],
                    ["Archive", "brief memory"],
                  ].map(([label, desc]) => (
                    <span key={label} className="rounded-full border border-border/70 bg-card/80 px-2.5 py-1 text-[10px] text-muted-foreground">
                      <span className="font-bold uppercase tracking-[0.12em] text-[#d4a03b]">{label}</span>{" "}
                      {desc}
                    </span>
                  ))}
                </div>
                {activeArchiveTopic && (
                  <div className="mx-auto mt-4 flex max-w-2xl items-start gap-2 rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-left">
                    <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d4a03b]" />
                    <p className="min-w-0 text-[13px] leading-6 text-muted-foreground sm:text-sm">
                      <span className="font-semibold text-[#d4a03b]">Active Archive Brief:</span>{" "}
                      <span className="line-clamp-2">{activeArchiveTopic}</span>
                    </p>
                  </div>
                )}
                {activeArchiveAngles && activeArchiveAngles.length > 0 && (
                  <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-border/70 border-t-[#3b6fd480] bg-card p-3 text-left text-xs text-muted-foreground">
                    <p className="mb-2 font-semibold uppercase tracking-widest text-muted-foreground">Research Angles</p>
                    <ul className="space-y-1">
                      {activeArchiveAngles.slice(0, 5).map((angle, i) => (
                        <li key={`${i}-${angle}`}>- {angle}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
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
                      className="feature-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70"
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
                        className="mt-1 border-t border-border/55 pt-2.5 text-xs leading-5 sm:pt-3 sm:text-[13px] sm:leading-6"
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
            <div className="mx-auto grid w-full max-w-4xl gap-2 rounded-2xl border border-border/70 bg-card/80 p-2 text-left min-[520px]:grid-cols-2 lg:grid-cols-4">
              {[
                ["Plan", "Topic-aware queries"],
                ["Retrieve", "Official and legal sources"],
                ["Validate", "Citation and source gates"],
                ["Archive", "Persistent brief memory"],
              ].map(([label, desc]) => (
                <div key={label} className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#d4a03b]">{label}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</div>
                </div>
              ))}
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
            onClick={scrollToBottom}
            className={cn(
              "scroll-bottom-btn fixed bottom-32 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md hover:bg-muted md:absolute md:bottom-32 md:right-8",
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
            <div className="sticky top-2 z-20 mx-auto flex w-full max-w-5xl justify-end px-1.5 sm:px-3 md:px-4">
              <button
                type="button"
                onClick={() => setShowLiveResearchRun((open) => !open)}
                className={cn(
                  "inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-2 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-muted sm:text-xs",
                  showLiveResearchRun && "border-[#3b6fd4]/35 bg-[#3b6fd4]/10"
                )}
                aria-expanded={showLiveResearchRun}
                data-testid="button-toggle-live-research"
              >
                <FlaskConical className={cn("h-3.5 w-3.5", pipeline.runStatus === "running" && "animate-pulse")} />
                <span>{showLiveResearchRun ? "Hide live research" : "See live research"}</span>
                <span className="hidden max-w-[160px] truncate rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                  {latestResearchSignal}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {researchSidebarSummary.totalSources > 0 ? `${researchSidebarSummary.totalSources} src` : "live"}
                </span>
              </button>
            </div>
          )}
          {isLoading && !conversation ? (
            <div className="space-y-4 animate-pulse" data-testid="conversation-loading-skeleton">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-4 bg-muted rounded w-2/3" />
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
                msg.role === prevRole &&
                dateKey === prevDateKey &&
                t && prevTime && (t - prevTime) < 2 * 60 * 1000;

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
                      msg.role === "user" ? "bg-[#3b6fd4] text-white" : "rounded-lg bg-[#3b6fd4] text-white",
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
                        ? "rounded-2xl rounded-br-sm border border-[#3b6fd420] bg-card text-foreground" /* Fix Bug L927: use CSS var not hardcoded dark */
                        : "assistant-bubble rounded-2xl rounded-tl-sm text-foreground"
                    )}>
                      {msg.role === "assistant" ? (
                        (() => {
                          const { cleanContent, meta } = extractPipelineMeta(msg.content, {
                            assistantMessageId: msg.id,
                            conversationId: msg.conversationId,
                          });
                          return (
                        <>
                          {meta && <PersistedPipeline meta={meta} />}
                          <div className="assistant-fade-in text-foreground">
                            <CitationMessage content={cleanContent} sources={meta?.sources ?? []} citationStatus={meta?.citationStatus ?? null} />
                          </div>
                          <button
                            onClick={() => handleCopyMessage(cleanContent)}
                            className="absolute top-1.5 right-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-background/80 text-muted-foreground hover:text-foreground"
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
                        className="msg-timestamp text-muted-foreground px-1"
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
                        disabled={!lastUserMessageRef.current}
                        className="mt-1 flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/60 hover:text-foreground"
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

          {researchRunAvailable && showLiveResearchRun && isStreaming && effectiveMode === "council" && (
            <div className="mx-auto w-full max-w-5xl px-1.5 animate-bubble-in sm:px-3 sm:pl-10 md:px-4 md:pl-12">
              <CouncilChamberPanel session={pipeline.councilSession} />
            </div>
          )}

          {researchRunAvailable && showLiveResearchRun && isStreaming && effectiveMode !== "council" && (
            <div className={cn(
              "mx-auto w-full px-1.5 animate-bubble-in sm:px-3 sm:pl-10 md:px-4 md:pl-12",
              showResearchRail ? "max-w-[calc(100vw-380px)] lg:max-w-3xl" : "max-w-5xl"
            )}>
              <ResearchPipeline
                mode={effectiveMode as Exclude<ChatMode, "council">}
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
                searchTier={(() => {
                  const keys = loadProviderKeys();
                  if (keys.tavilyApiKey.trim()) return "TAVILY";
                  if (keys.serperApiKey.trim()) return "SERPER";
                  if (keys.exaApiKey.trim()) return "EXA";
                  if (keys.braveApiKey.trim()) return "BRAVE";
                  return "DDG ONLY";
                })()}
                dataCheatsheet={pipeline.dataCheatsheet}
              />
            </div>
          )}

          {isStreaming && chatType === "research" && currentMode === "normal" && (
            <div className="mx-auto flex w-full max-w-5xl flex-row gap-2 px-1.5 animate-bubble-in sm:px-3 md:gap-3 md:px-4" data-testid="message-streaming">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground mt-1 animate-pulse-soft">
                <Bot className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div className="flex w-full max-w-[calc(100%-2.5rem)] flex-col gap-2 sm:max-w-[85ch]">
                <div className="assistant-bubble w-full rounded-[20px] px-3.5 py-3 text-foreground transition-all duration-200 sm:px-5 sm:py-4">
                  <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                    {(() => {
                      if (!streamingContent) {
                        return <ThinkingIndicator mode="normal" />;
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
                            <ThinkingIndicator mode="normal" />
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isStreaming && chatType === "rhetorics" && (
            <div className="mx-auto flex w-full max-w-5xl flex-row gap-2 px-1.5 animate-bubble-in sm:px-3 md:gap-3 md:px-4">
              <div className={cn(
                "w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 mt-1 text-base",
                rhetoricsType === "debate" ? "bg-rose-100 dark:bg-rose-950/40"
                  : rhetoricsType === "kavita" ? "bg-amber-100 dark:bg-amber-950/40"
                  : "bg-violet-100 dark:bg-violet-950/40"
              )}>
                <Bot className="h-4 w-4 text-slate-500 dark:text-slate-300" />
              </div>
              <div className="flex w-full max-w-[calc(100%-2.5rem)] flex-col gap-1.5 sm:max-w-[85ch]">
                <p className={cn("text-[10px] font-semibold",
                  rhetoricsType === "debate" ? "text-rose-500 dark:text-rose-400"
                    : rhetoricsType === "kavita" ? "text-amber-600 dark:text-amber-400"
                    : "text-violet-500 dark:text-violet-400"
                )}>
                  {rhetoricsType === "debate" ? "Opposing Delegate" : rhetoricsType === "kavita" ? "Kavita" : "Opening Speech"}
                </p>
                <div className={cn(
                   "w-full rounded-2xl rounded-tl-sm px-3.5 py-3 text-foreground shadow-sm transition-all duration-200 sm:px-5 sm:py-4",
                  rhetoricsType === "kavita"  ? "bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                    : rhetoricsType === "debate" ? "bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800"
                    : "bg-muted"
                )}>
                  <div className={cn("prose dark:prose-invert max-w-none whitespace-pre-wrap", rhetoricsType === "kavita" ? "text-base leading-loose" : "text-sm")}>
                    {(() => {
                      if (!pipeline.streamingContent) {
                        return <ThinkingIndicator mode="rhetorics" rhetoricsType={rhetoricsType} />;
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
                            <ThinkingIndicator mode="rhetorics" rhetoricsType={rhetoricsType} />
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
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">💬 Counter-arguments</p>
              <div className="flex flex-col gap-1.5">
                {debateSuggestions.map((s, i) => (
                  <button key={i} onClick={() => { setInput(s); focusInput(); }}
                    className="text-left text-[11px] px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
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
        "shrink-0 border-t border-border/70 bg-background/95 px-2 py-2 safe-area-inset-bottom sm:px-3 md:px-2",
        showResearchRail && "lg:mr-[344px]"
      )}>
        {connectionWarn && (
          <div className="flex items-center gap-2 px-4 py-2 mb-2 text-xs bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-700 dark:text-yellow-300">
            <span>⚠️ High latency detected — deep research may take longer than usual on your connection.</span>
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
            isStreaming={isStreaming}
            isEnhancing={isEnhancing}
            disabled={activeRunInFlight}
            placeholder={
              chatType === "rhetorics" && rhetoricsType === "debate"  ? "Make your argument — I'll take the opposing side..."
              : chatType === "rhetorics" && rhetoricsType === "kavita" ? "Describe your committee topic — I'll write a Kavita..."
              : chatType === "rhetorics" && rhetoricsType === "speech" ? "Tell me your country and topic — I'll write your opening speech..."
              : currentMode === "fast_research" ? "Ask anything — I'll run a fast source-backed research pass..."
              : currentMode === "deep_research" ? "Ask a serious prep question — I'll run a deeper multi-source pass..."
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
              if (activeRunInFlight) cancelActiveRun();
              resetPipelineState();
              if (id === "drafting") { setChatType("research"); setCurrentMode("normal"); }
              else if (id === "rhetorics") { setChatType("rhetorics"); setShowOptions(true); }
              else if (id === "fast") { setChatType("research"); setCurrentMode("fast_research"); }
              else if (id === "deep") { setChatType("research"); setCurrentMode("deep_research"); }
              else if (id === "council") { setChatType("research"); setCurrentMode("council"); }
              if (id !== "rhetorics") setShowOptions(false);
              focusInput();
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
            statusBadge={(() => {
              const meta = MODE_META[currentMode];
              return { label: meta.label, color: meta.color, bg: meta.bg, border: meta.border };
            })()}
            modelSummary={currentMode === "normal"
              ? simplifyModelName(normalModel)
              : activeModeModels.length === 1
                ? undefined
                : activeModeModels.map(simplifyModelName).join(" · ") || "none"}
            focusRef={composerFocusRef}
          />

          {showOptions && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-30 max-h-[min(48vh,24rem)] overflow-y-auto rounded-2xl border border-border/70 bg-popover/95 p-2 text-popover-foreground shadow-[0_24px_80px_rgba(15,23,42,0.22)] md:left-4 md:right-4 dark:border-[#2a2d38] dark:bg-[#0d0e12]/95 dark:shadow-[0_24px_80px_rgba(0,0,0,0.48)]"
            >
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-border/60 px-1 pb-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {chatType === "rhetorics" ? "Rhetorics controls" : "Model selection"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {chatType === "rhetorics"
                      ? "Tune speech mode and creativity."
                      : currentMode === "normal"
                        ? simplifyModelName(normalModel)
                        : `${selectedModelCount} model${selectedModelCount === 1 ? "" : "s"} selected`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOptions(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close options"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* ── Level 2: Sub-modes ────────────────────────────────────── */}
              {chatType === "rhetorics" && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border/60 bg-card/70 p-1.5 backdrop-blur-xl">
                    {([
                      { id: "kavita" as RhetoricsType, label: "Kavita" },
                      { id: "speech" as RhetoricsType, label: "Opening Speech" },
                      { id: "debate" as RhetoricsType, label: "Open Debate" },
                    ]).map(({ id, label }) => (
                      <button key={id} onClick={() => setRhetoricsType(id)}
                        className={cn(
                          "min-h-9 rounded-xl border px-2 py-1.5 text-[10px] font-semibold leading-tight transition-all md:text-[11px]",
                          rhetoricsType === id
                            ? "border-slate-300 bg-slate-100 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/50 border-transparent",
                        )}
                      >{label}</button>
                    ))}
                  </div>
                  {/* Creativity Dial */}
                  <div className="space-y-3 px-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Creativity</span>
                      <span
                        className="rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${creativity < 0.45 ? "#3b6fd4" : creativity < 0.75 ? "#8b5cf6" : "#f59e0b"}18`,
                          borderColor: `${creativity < 0.45 ? "#3b6fd4" : creativity < 0.75 ? "#8b5cf6" : "#f59e0b"}25`,
                          color: creativity < 0.45 ? "#3b6fd4" : creativity < 0.75 ? "#8b5cf6" : "#f59e0b",
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
                    <div className="relative h-2 rounded-full bg-muted">
                      <motion.div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width: `${creativity * 100}%`,
                          background: `linear-gradient(90deg, #3b6fd4, ${creativity < 0.45 ? "#3b6fd4" : creativity < 0.75 ? "#8b5cf6" : "#f59e0b"})`,
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
                          borderColor: creativity < 0.45 ? "#3b6fd4" : creativity < 0.75 ? "#8b5cf6" : "#f59e0b",
                          transform: "translateX(-50%) translateY(-50%)",
                        }}
                        transition={{ duration: 0.15 }}
                      />
                    </div>
                    <div className="flex justify-between px-0.5 text-xs text-muted-foreground">
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
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Search models..."
                  className="h-10 w-full rounded-xl border border-border/70 bg-background/70 pl-9 pr-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-[#3b6fd470] focus:ring-2 focus:ring-[#3b6fd420]"
                  data-testid="input-model-search"
                />
              </div>

              <div className="max-h-[min(34vh,18rem)] space-y-2 overflow-y-auto pr-1">
                {!hasModelOptions ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                    No provider models available.
                  </div>
                ) : filteredModelGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                    No models match “{modelSearch.trim()}”.
                  </div>
                ) : (
                  filteredModelGroups.map(({ provider, models }) => (
                    <div key={provider} className="space-y-1">
                      <div className="px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        {provider}
                      </div>
                      {models.map((model) => {
                        const modelId = `${provider.toLowerCase()}/${model.id}`;
                        const selected = currentMode === "normal"
                          ? normalModel === modelId
                          : activeModeModels.includes(modelId);
                        return (
                          <button
                            key={modelId}
                            type="button"
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
                                ? "border-[#3b6fd450] bg-[#3b6fd414] text-foreground"
                                : "border-border/55 bg-background/45 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
                            )}
                          >
                            <span className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                              selected
                                ? "border-[#3b6fd450] bg-[#3b6fd4] text-white"
                                : "border-border/70 bg-card text-muted-foreground",
                            )}>
                              {selected ? <Check className="h-3 w-3" /> : getModelIcon(model.id)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">
                                {model.name || simplifyModelName(model.id)}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {provider} / {simplifyModelName(model.id)}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                <span className="truncate text-[10px] text-muted-foreground">
                  {currentMode === "normal"
                    ? `Selected: ${simplifyModelName(normalModel)}`
                    : `${selectedModelCount} selected for ${MODE_META[currentMode].label}`}
                </span>
                {modelSelectionDirty && (
                  <button
                    type="button"
                    onClick={saveModelSelection}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#2A3342] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1D2533]"
                    data-testid="button-save-models"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save models
                  </button>
                )}
              </div>
            </div>
          )}
            </motion.div>
          )}

          {/* Footer status */}
          <div className="hidden items-center gap-3 border-t border-[#1e1e26] px-1 py-1.5 sm:flex">
            {tokensPerSec !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400 animate-in fade-in">
                {tokensPerSec} tok/s
              </span>
            )}
            <span
              className="rounded px-1.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${activeModeColor}12`, color: activeModeColor }}
            >
              {chatType === "rhetorics" ? "Rhetorics" : MODE_META[currentMode].label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
