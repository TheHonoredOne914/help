import { useEffect, useMemo, useState, useRef } from "react";
import { Sidebar } from "@/components/chat/sidebar";
import { ChatArea } from "@/components/chat/chat-area";
import { TopHeader } from "@/components/chat/top-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getListArchivesQueryKey,
  useCreateArchive,
  useUpdateResearchAngles,
  useListArchives,
  type Archive,
} from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";

export default function Chat() {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeArchiveId, setActiveArchiveId] = useState<number | null>(null);
  const [archiveName, setArchiveName] = useState("");
  const [archiveTopic, setArchiveTopic] = useState("");
  const [createArchiveOpen, setCreateArchiveOpen] = useState(false);
  const [createArchiveError, setCreateArchiveError] = useState<string | null>(null);
  const [createTab, setCreateTab] = useState<"topic" | "angles">("topic");
  const [angleDrafts, setAngleDrafts] = useState<string[]>([]);
  const [newAngle, setNewAngle] = useState("");
  const queryClient = useQueryClient();
  const { data: archives = [], isLoading: archivesLoading } = useListArchives();
  const createArchiveMutation = useCreateArchive();
  const updateResearchAnglesMutation = useUpdateResearchAngles();

  const buildAngles = (topic: string) => {
    const t = topic.trim();
    if (!t) return [];
    return [
      `Root causes and timeline of ${t} in the Indian policy context`,
      `Constitutional provisions, Supreme Court doctrine, and rights challenges around ${t}`,
      `Union ministry accountability and parliamentary questions relevant to ${t}`,
      `Treasury Bench defence, Opposition critique, and coalition pressure on ${t}`,
      `Federalism objections and state government implications linked to ${t}`,
      `Election Commission, public order, or national security arguments where relevant to ${t}`,
      `Statistical indicators, budgetary data, and implementation gaps for ${t}`,
      `Indian major media, policy research, and legal commentary around ${t}`,
      `Floor strategy: POIs, rebuttals, motions, amendments, and committee recommendations for ${t}`,
      `Unresolved research gaps and evidence conflicts for ${t}`,
    ];
  };

  const activeArchive = useMemo(
    () => archives.find((archive) => archive.id === activeArchiveId) ?? null,
    [archives, activeArchiveId]
  );

  const shouldSuggestCreateArchive = !archivesLoading && archives.length === 0;

  const hasPromptedForArchiveRef = useRef(false);

  useEffect(() => {
    if (shouldSuggestCreateArchive && !hasPromptedForArchiveRef.current) {
      hasPromptedForArchiveRef.current = true;
      setCreateArchiveOpen(true);
    }
  }, [shouldSuggestCreateArchive]);

  useEffect(() => {
    if (archivesLoading) return;
    if (archives.length === 0) {
      setActiveArchiveId(null);
      return;
    }
    const stored = Number(localStorage.getItem("activeArchiveId"));
    const storedValid = Number.isFinite(stored) && archives.some((archive) => archive.id === stored);
    if (storedValid) {
      setActiveArchiveId(stored);
      return;
    }
    setActiveArchiveId((current) => {
      if (current && archives.some((archive) => archive.id === current)) return current;
      return archives[0].id;
    });
  }, [archives, archivesLoading]);

  useEffect(() => {
    if (!activeArchiveId) return;
    localStorage.setItem("activeArchiveId", String(activeArchiveId));
    const storedConversation = Number(localStorage.getItem(`activeConversationId:${activeArchiveId}`));
    setActiveConversationId(Number.isFinite(storedConversation) && storedConversation > 0 ? storedConversation : null);
  }, [activeArchiveId]);

  useEffect(() => {
    if (!activeArchiveId) return;
    const key = `activeConversationId:${activeArchiveId}`;
    if (activeConversationId) localStorage.setItem(key, String(activeConversationId));
    else localStorage.removeItem(key);
  }, [activeArchiveId, activeConversationId]);

  const handleArchiveChange = (archiveId: number) => {
    setActiveArchiveId(archiveId);
    setActiveConversationId(null);
    setMobileSidebarOpen(false);
  };

  const openCreateArchiveDialog = () => {
    setCreateArchiveError(null);
    setCreateTab("topic");
    setAngleDrafts([]);
    setNewAngle("");
    setCreateArchiveOpen(true);
  };

  const handleCreateArchive = async () => {
    const name = archiveName.trim();
    const topic = archiveTopic.trim();
    if (!name || !topic) return;

    setCreateArchiveError(null);

    try {
      const created = await createArchiveMutation.mutateAsync({ data: { name, topic } });
      let createdArchive: Archive = created;
      if (angleDrafts.length > 0) {
        const angles = angleDrafts.slice(0, 20).map((a) => a.trim()).filter(Boolean);
        await updateResearchAnglesMutation.mutateAsync({
          archiveId: created.id,
          data: { angles },
        });
        createdArchive = { ...created, researchAngles: angles };
      }

      queryClient.setQueryData<Archive[]>(getListArchivesQueryKey(), (old = []) => [
        ...old.filter((archive) => archive.id !== createdArchive.id),
        createdArchive,
      ]);
      handleArchiveChange(created.id);
      setCreateArchiveOpen(false);
      setArchiveName("");
      setArchiveTopic("");
      setAngleDrafts([]);
      setCreateTab("topic");

      void queryClient.invalidateQueries({ queryKey: getListArchivesQueryKey() });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create archive. Please try again.";
      setCreateArchiveError(message);
    }
  };

  return (
    <div
      className="bestdel-app-shell flex h-dvh w-screen max-w-full overflow-hidden text-foreground font-sans"
      style={{ backgroundColor: "var(--bg-shell)" }}
    >
      <div className="flex min-h-0 flex-1 overflow-hidden" style={{ backgroundColor: "var(--bg-shell)" }}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TopHeader
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onCreateArchive={openCreateArchiveDialog}
            activeArchiveName={activeArchive?.name ?? null}
          />
          <div className="flex min-h-0 w-full flex-1 overflow-hidden">
            <div className="flex min-h-0 flex-1 overflow-hidden border-t bg-background" style={{ borderColor: "var(--border-hex)" }}>
              <Sidebar
                activeConversationId={activeConversationId}
                activeArchiveId={activeArchiveId}
                onSelectConversation={setActiveConversationId}
                onSelectArchive={handleArchiveChange}
                onCreateArchive={openCreateArchiveDialog}
                mobileOpen={mobileSidebarOpen}
                onMobileClose={() => setMobileSidebarOpen(false)}
              />
              <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                {!archivesLoading && archives.length === 0 && !createArchiveOpen && (
                  <div className="border-b px-3 py-3 sm:px-5" style={{ borderBottomColor: "var(--border-hex)" }}>
                    <div className="flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">No archives yet</div>
                        <div className="text-sm text-muted-foreground">
                          Begin with an Archive, a dedicated workspace that retains context, sources, and strategy for your committee agenda.
                        </div>
                      </div>
                      <Button className="w-full sm:w-auto" onClick={openCreateArchiveDialog}>Create archive</Button>
                    </div>
                  </div>
                )}
                <ChatArea
                  conversationId={activeConversationId}
                  activeArchiveId={activeArchiveId}
                  activeArchiveName={activeArchive?.name ?? null}
                  activeArchiveTopic={activeArchive?.topic ?? null}
                  activeArchiveAngles={activeArchive?.researchAngles ?? []}
                  onConversationCreated={setActiveConversationId}
                  onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
                  onNewChat={() => setActiveConversationId(null)}
                />
              </main>
            </div>
          </div>
        </div>
      </div>
      <Dialog
        open={createArchiveOpen}
        onOpenChange={(open) => {
          setCreateArchiveOpen(open);
          if (!open) setCreateArchiveError(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{archives.length === 0 ? "Create your first archive" : "Create archive"}</DialogTitle>
            <DialogDescription>
              Archives keep each Indian committee agenda in its own source-backed workspace, preserving brief context, research angles, and floor strategy across chats.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as "topic" | "angles")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="topic">Topic Setup</TabsTrigger>
              <TabsTrigger value="angles">Research Angles</TabsTrigger>
            </TabsList>
            <TabsContent value="topic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Archive name</label>
                <Input
                  value={archiveName}
                  onChange={(e) => setArchiveName(e.target.value)}
                  placeholder="AIPPM Federalism Brief"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic</label>
                <Textarea
                  value={archiveTopic}
                  onChange={(e) => setArchiveTopic(e.target.value)}
                  placeholder="Centre-state powers, Supreme Court doctrine, party positions, and floor strategy for the agenda"
                  className="min-h-28"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!archiveTopic.trim()}
                  onClick={() => {
                    setAngleDrafts(buildAngles(archiveTopic));
                    setCreateTab("angles");
                  }}
                >
                  Generate angles
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="angles" className="space-y-3 mt-4">
              {angleDrafts.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Generate angles from Topic Setup first.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto pr-1">
                  {angleDrafts.map((angle, idx) => (
                    <div key={`${idx}-${angle}`} className="flex items-center gap-2">
                      <Input
                        value={angle}
                        onChange={(e) => setAngleDrafts((prev) => prev.map((a, i) => i === idx ? e.target.value : a))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setAngleDrafts((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={newAngle}
                  onChange={(e) => setNewAngle(e.target.value)}
                  placeholder="Add custom angle..."
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const v = newAngle.trim();
                    if (!v) return;
                    setAngleDrafts((prev) => [...prev, v].slice(0, 20));
                    setNewAngle("");
                  }}
                >
                  Add
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          {createArchiveError && (
            <div className="text-sm text-destructive">
              {createArchiveError}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={handleCreateArchive}
              disabled={createArchiveMutation.isPending || updateResearchAnglesMutation.isPending || !archiveName.trim() || !archiveTopic.trim()}
            >
              {createArchiveMutation.isPending ? "Creating..." : "Create archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
