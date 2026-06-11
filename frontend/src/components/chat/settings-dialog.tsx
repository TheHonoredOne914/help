import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Sparkles, RotateCcw, Key, RefreshCw, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProviderModels } from "@/hooks/use-provider-models";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_PROVIDER_KEYS,
  PROVIDER_KEY,
  getProviderHeadersFromKeys,
  loadProviderKeys,
  type ProviderKeys,
} from "@/lib/provider-keys";

const STORAGE_KEY = "ai-research:system-prompts:v1";
export const AUTO_FALLBACK_STORAGE_KEY = "bestdel:auto-fallback:v1";

export interface SystemPrompts {
  global: string;
  normal: string;
  web_search: string;
  deep_research: string;
}

const DEFAULT_PROMPTS: SystemPrompts = { global: "", normal: "", web_search: "", deep_research: "" };

const PLACEHOLDERS: Record<keyof SystemPrompts, string> = {
  global: "Applies to all chats. e.g. 'Always respond in plain English. Be concise. Use bullet points.'",
  normal: "Extra instructions for normal chat mode only.",
  web_search: "Extra instructions for web search mode only.",
  deep_research: "Extra instructions for deep research mode only.",
};

export function loadSystemPrompts(): SystemPrompts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROMPTS;
    return { ...DEFAULT_PROMPTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROMPTS;
  }
}

export function getSystemPromptForMode(mode: "normal" | "web_search" | "deep_research" | "fast_research" | "council"): string {
  const p = loadSystemPrompts();
  const promptKey = mode === "normal" ? "normal" : mode === "fast_research" ? "web_search" : "deep_research";
  return [p.global.trim(), p[promptKey].trim()].filter(Boolean).join("\n\n");
}

export function loadAutoFallback(): boolean {
  try {
    return localStorage.getItem(AUTO_FALLBACK_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveAutoFallback(value: boolean): void {
  localStorage.setItem(AUTO_FALLBACK_STORAGE_KEY, value ? "true" : "false");
}

function providerKeyValue(provider: string, keys: ProviderKeys): string {
  switch (provider) {
    case "groq": return keys.groqApiKey;
    case "openrouter": return keys.openrouterApiKey;
    case "nvidia": return keys.nvidiaApiKey;
    case "github": return keys.githubModelsApiKey;
    case "gemini": return keys.geminiApiKey;
    case "ollama": return keys.ollamaApiKey || keys.ollamaBaseUrl;
    case "tavily": return keys.tavilyApiKey;
    case "jina": return keys.jinaApiKey;
    case "brave": return keys.braveApiKey;
    case "serper": return keys.serperApiKey;
    case "exa": return keys.exaApiKey;
    case "firecrawl": return keys.firecrawlApiKey;
    case "cerebras": return keys.cerebrasApiKey;
    case "scraperapi": return keys.scraperapiApiKey;
    case "zenrows": return keys.zenrowsApiKey;
    case "scrapingbee": return keys.scrapingbeeApiKey;
    case "geekflare": return keys.geekflareApiKey;
    default: return "";
  }
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

type TabKey = keyof SystemPrompts | "providers";

export function SettingsDialog({ open, onOpenChange, onSave }: SettingsDialogProps) {
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const [prompts, setPrompts] = useState<SystemPrompts>(DEFAULT_PROMPTS);
  const [keys, setKeys] = useState<ProviderKeys>(DEFAULT_PROVIDER_KEYS);
  const [savedKeys, setSavedKeys] = useState<ProviderKeys>(DEFAULT_PROVIDER_KEYS);
  const [autoFallback, setAutoFallback] = useState(true);
  const [tab, setTab] = useState<TabKey>("global");
  const [tavilyStatus, setTavilyStatus] = useState<"idle"|"ok"|"error"|"checking">("idle");
  const { providerStatus, refreshAllProviders, isRefreshing, lastRefreshAt } = useProviderModels();

  const checkTavily = async (key: string) => {
    if (!key.trim()) { setTavilyStatus("idle"); return; }
    setTavilyStatus("checking");
    try {
      const r = await apiFetch("/api/tavily/status", {
        headers: { "X-Tavily-Api-Key": key.trim() }
      });
        const d = await r.json().catch(() => null);
        setTavilyStatus(d?.status === "ok" ? "ok" : "error");
    } catch { setTavilyStatus("error"); }
  };

  useEffect(() => {
    const t = setTimeout(() => checkTavily(keys.tavilyApiKey), 500);
    return () => clearTimeout(t);
  }, [keys.tavilyApiKey]);

  useEffect(() => {
    if (open) {
      setPrompts(loadSystemPrompts());
      const loadedKeys = loadProviderKeys();
      setKeys(loadedKeys);
      setSavedKeys(loadedKeys);
      setAutoFallback(loadAutoFallback());
      void refreshAllProviders(loadedKeys);
    }
  }, [open, refreshAllProviders]);

const handleSave = async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    localStorage.setItem(PROVIDER_KEY, JSON.stringify(keys));
    saveAutoFallback(autoFallback);
    setSavedKeys(keys);
    window.dispatchEvent(new CustomEvent("bestdel:provider-keys-updated", { detail: { keys, autoFallback, changedAt: Date.now(), forceRefresh: true } }));
    if (tab === "providers") {
      await refreshAllProviders(keys);
      await apiFetch(`/api/providers/diagnostics?refresh=${Date.now()}`, {
        method: "POST",
        headers: getProviderHeadersFromKeys(keys),
      }).catch((err) => {
        console.warn("[BestDel providers] diagnostics refresh failed", err);
      });
    }
    onSave?.();
    if (tab !== "providers") onOpenChange(false);
  };

  const handleReset = () => {
    if (tab === "providers") setKeys(DEFAULT_PROVIDER_KEYS);
    else setPrompts(DEFAULT_PROMPTS);
  };

  const handleLogout = async () => {
    await signOut();
    queryClient.clear();
    onOpenChange(false);
    window.location.assign("/auth");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Customize the AI's behavior with system prompts, or override provider API keys for this browser session.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="global" className="text-xs">Global</TabsTrigger>
            <TabsTrigger value="normal" className="text-xs">Normal</TabsTrigger>
            <TabsTrigger value="web_search" className="text-xs">Web</TabsTrigger>
            <TabsTrigger value="deep_research" className="text-xs">Deep</TabsTrigger>
            <TabsTrigger value="providers" className="text-xs gap-1">
              <Key className="w-3 h-3" />
              Keys
            </TabsTrigger>
          </TabsList>

          {(["global", "normal", "web_search", "deep_research"] as (keyof SystemPrompts)[]).map((key) => (
            <TabsContent key={key} value={key} className="mt-3 space-y-2">
              <Label htmlFor={`sp-${key}`} className="text-xs flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-500" />
                System prompt — {key.replace("_", " ")}
              </Label>
              <Textarea
                id={`sp-${key}`}
                placeholder={PLACEHOLDERS[key]}
                value={prompts[key]}
                onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
                className="min-h-[160px] text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                {key === "global"
                  ? "Used for every conversation in every mode."
                  : `Only used in ${key.replace("_", " ")} mode (combined with the global prompt).`}
              </p>
            </TabsContent>
          ))}

          <TabsContent value="providers" className="mt-3 space-y-4 max-h-[400px] overflow-y-auto pr-1">
            <p className="text-[11px] text-muted-foreground">
              Override API keys per-request. Stored only in your browser (localStorage). Leave blank to use the
              server-side keys.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="auto-fallback-toggle" className="text-xs font-semibold">
                  Auto-fallback to other providers if selected provider fails
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Off = BestDel uses only your selected model. On = BestDel may try other configured providers.
                </p>
              </div>
              <Switch
                id="auto-fallback-toggle"
                checked={autoFallback}
                onCheckedChange={setAutoFallback}
                aria-label="Auto-fallback to other providers if selected provider fails"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-muted-foreground">
                {lastRefreshAt ? `Last refreshed ${new Date(lastRefreshAt).toLocaleTimeString()}` : "Provider status has not refreshed yet."}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refreshAllProviders(keys)}
                className="h-7 gap-1.5 text-[10px]"
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
              {["groq", "openrouter", "nvidia", "github", "gemini", "ollama", "cerebras", "serper", "exa", "tavily", "brave", "firecrawl", "jina", "scraperapi", "zenrows", "scrapingbee", "geekflare"].map((provider) => {
                const health = providerStatus[provider as keyof typeof providerStatus];
                const currentConfigured = Boolean(providerKeyValue(provider, keys).trim());
                const savedConfigured = Boolean(providerKeyValue(provider, savedKeys).trim());
                const effectiveConfigured = currentConfigured || savedConfigured || Boolean(health?.configured);
                const dirty = providerKeyValue(provider, keys) !== providerKeyValue(provider, savedKeys);
                const needsRefresh = effectiveConfigured && !health?.configured && !dirty;
                const checking = Boolean(health?.checking || (isRefreshing && effectiveConfigured));
                const tone = dirty ? "text-amber-400" : checking ? "text-sky-500" : needsRefresh ? "text-amber-400" : !effectiveConfigured ? "text-amber-500" : health?.healthy ? "text-emerald-500" : health?.status === "unverified" || health?.status === "catalog_fallback" || health?.status === "network_error" ? "text-amber-400" : "text-red-500";
const keySource = health?.configuredFrom === "server_env" ? " (server)" : health?.configuredFrom === "browser" ? " (browser)" : "";
if (import.meta.env.DEV) {
  console.debug(`[settings-dialog] ${provider}: health=`, JSON.stringify(health), `status="${health?.status}" configured=${health?.configured} healthy=${health?.healthy} checking=${health?.checking} error="${health?.error}"`);
}
const label = dirty
  ? "unsaved"
  : checking ? "checking"
  : needsRefresh ? "not checked"
  : !effectiveConfigured ? "missing"
  : health?.healthy ? `connected${keySource}${health.modelCount ? ` · ${health.modelCount}` : ""}`
  : health?.status === "catalog_fallback" ? `catalog only${keySource}${health.modelCount ? ` · ${health.modelCount}` : ""}`
  : health?.status === "unverified" ? `unverified${keySource}`
  : health?.status === "invalid_key" ? "invalid key"
  : health?.status === "rate_limited" ? "rate limited"
  : health?.status === "network_error" ? `connected${keySource} · ${health.modelCount ? `${health.modelCount} models (fallback)` : "model list unavailable"}`
  : health?.status === "missing_key" ? "missing key"
  : health?.status === "checking" ? "checking"
  : (health?.error ?? "unavailable");
                return (
                  <div key={provider} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-semibold uppercase tracking-wide text-muted-foreground">{provider}</span>
                    <span className={tone} title={health?.error}>
                      {label}
                      {health?.latencyMs ? ` · ${health.latencyMs}ms` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="groq-key" className="text-xs">Groq API key</Label>
              <Input id="groq-key" type="password" placeholder="gsk_..." value={keys.groqApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, groqApiKey: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nvidia-key" className="text-xs">NVIDIA API key</Label>
              <Input id="nvidia-key" type="password" placeholder="nvapi-..." value={keys.nvidiaApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, nvidiaApiKey: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">
                Used for NVIDIA NIM (models at <code>integrate.api.nvidia.com/v1</code>).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gemini-key" className="text-xs flex items-center gap-2">
                <span>🔵</span> Gemini API Key
              </Label>
              <Input id="gemini-key" type="password" placeholder="your-gemini-api-key" value={keys.geminiApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, geminiApiKey: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">
                Powers Gemini 2.0 Flash and 1.5 Pro. Get a free key at{" "}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">
                  aistudio.google.com
                </a>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">OpenRouter API Key</Label>
              <Input
                type="password"
                placeholder="sk-or-..."
                value={keys.openrouterApiKey}
                onChange={(e) => setKeys(k => ({ ...k, openrouterApiKey: e.target.value }))}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Access 100+ models via <a href="https://openrouter.ai" target="_blank" rel="noopener" className="underline">openrouter.ai</a>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">GitHub Models token</Label>
              <Input
                type="password"
                placeholder="github_pat_..."
                value={keys.githubModelsApiKey}
                onChange={(e) => setKeys(k => ({ ...k, githubModelsApiKey: e.target.value }))}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Used for GitHub Models API access. Token needs models access.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cerebras API Key</Label>
              <Input
                type="password"
                placeholder="csk-..."
                value={keys.cerebrasApiKey}
                onChange={(e) => setKeys(k => ({ ...k, cerebrasApiKey: e.target.value }))}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Ultra-fast inference via <a href="https://inference.cerebras.ai" target="_blank" rel="noopener" className="underline">Cerebras Wafer-Scale Engine</a>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tavily-key" className="text-xs flex items-center gap-2">
                <span>🔍</span> Tavily API Key
              </Label>
              <Input id="tavily-key" type="password" placeholder="tvly-xxxxxxxxxxxxxxxx" value={keys.tavilyApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, tavilyApiKey: e.target.value }))} />
              <div className="flex flex-col gap-1">
                {tavilyStatus === "ok"    && <span className="text-[10px] text-green-600 font-medium">✓ Connected — Tier 1 search active</span>}
                {tavilyStatus === "error" && <span className="text-[10px] text-red-500 font-medium">✗ Invalid key — falling back to DuckDuckGo</span>}
                {tavilyStatus === "checking" && <span className="text-[10px] text-muted-foreground">Checking…</span>}
                <p className="text-[10px] text-muted-foreground">
                  Powers web search. Get a free key at{" "}
                  <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" className="underline">
                    tavily.com
                  </a>
                </p>
              </div>
            </div>
            <div className="border-t border-[#27272f] pt-3">
              <p className="text-[11px] font-semibold text-[#9a9ab0]">Search Enhancement (Optional)</p>
              <p className="text-[11px] text-[#44445a]">Extra retrieval providers for stronger Indian government, legal, and passage-level source use.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serper-key" className="text-xs">Serper.dev (Google Search)</Label>
              <Input id="serper-key" type="password" placeholder="your-serper-key" value={keys.serperApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, serperApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Improves Indian gov source coverage. Free tier: 2500 searches/month. https://serper.dev
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exa-key" className="text-xs">Exa API Key (Semantic Search)</Label>
              <Input id="exa-key" type="password" placeholder="exa_..." value={keys.exaApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, exaApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Adds semantic source discovery for policy papers, legal commentary, and related reports. https://exa.ai
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brave-key" className="text-xs">Brave Search</Label>
              <Input id="brave-key" type="password" placeholder="BSA..." value={keys.braveApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, braveApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Reliable Google alternative. Free tier: 2000 queries/month. https://brave.com/search/api
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jina-key" className="text-xs">Jina AI (Reader + Reranker)</Label>
              <Input id="jina-key" type="password" placeholder="jina_..." value={keys.jinaApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, jinaApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Improves page extraction and source relevance. Free: 1M tokens/month. https://jina.ai
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="firecrawl-key" className="text-xs">Firecrawl API Key (Page Extraction)</Label>
              <Input id="firecrawl-key" type="password" placeholder="fc-..." value={keys.firecrawlApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, firecrawlApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Primary markdown extraction for source pages before Jina and snippet fallback. https://firecrawl.dev
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scraperapi-key" className="text-xs">ScraperAPI Key (Page Extraction)</Label>
              <Input id="scraperapi-key" type="password" placeholder="your-scraperapi-key" value={keys.scraperapiApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, scraperapiApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Backup extraction for JS-heavy or geo-blocked pages. https://www.scraperapi.com
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zenrows-key" className="text-xs">ZenRows API Key (Page Extraction)</Label>
              <Input id="zenrows-key" type="password" placeholder="your-zenrows-key" value={keys.zenrowsApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, zenrowsApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Optional premium proxy extraction with anti-bot bypass. https://www.zenrows.com
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scrapingbee-key" className="text-xs">ScrapingBee API Key (Page Extraction)</Label>
              <Input id="scrapingbee-key" type="password" placeholder="your-scrapingbee-key" value={keys.scrapingbeeApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, scrapingbeeApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Optional extraction with render_js and premium proxies. https://www.scrapingbee.com
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="geekflare-key" className="text-xs">Geekflare API Key (Page Extraction)</Label>
              <Input id="geekflare-key" type="password" placeholder="your-geekflare-key" value={keys.geekflareApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, geekflareApiKey: e.target.value }))} />
              <p className="text-[11px] text-[#44445a] mt-1">
                Optional extraction. Endpoint must be verified via GEEKFLARE_ENDPOINT_VERIFIED=true before activation. https://geekflare.com
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ollama-key" className="text-xs">Ollama API key</Label>
              <Input id="ollama-key" type="password" placeholder="(for ollama.com cloud)" value={keys.ollamaApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, ollamaApiKey: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ollama-url" className="text-xs">Ollama base URL</Label>
              <Input id="ollama-url" type="text" placeholder="https://ollama.com/v1 or http://localhost:11434/v1"
                value={keys.ollamaBaseUrl}
                onChange={(e) => setKeys((k) => ({ ...k, ollamaBaseUrl: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">
                Leave the path off — we'll add <code>/v1</code> automatically if missing.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="openai-key" className="text-xs">OpenAI API key</Label>
              <Input id="openai-key" type="password" placeholder="sk-..." value={keys.openaiApiKey}
                onChange={(e) => setKeys((k) => ({ ...k, openaiApiKey: e.target.value }))} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-2">
          <div className="mr-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs gap-1.5">
              <RotateCcw className="w-3 h-3" />
              Reset {tab === "providers" ? "keys" : "all"}
            </Button>
            {user && (
              <Button variant="outline" size="sm" onClick={handleLogout} className="text-xs gap-1.5">
                <LogOut className="w-3 h-3" />
                Log out
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
