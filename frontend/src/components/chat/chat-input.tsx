import { Send, FlaskConical, Gauge, Layers, MessageSquare, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatInputMode = "normal" | "fast_research" | "deep_research";

interface ChatInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSend: () => void;
  mode: ChatInputMode;
  setMode: (mode: ChatInputMode) => void;
  selectedModels: string[];
  disabled?: boolean;
}

const MODES: Array<{ mode: ChatInputMode; label: string; icon: LucideIcon; title: string }> = [
  { mode: "normal", label: "Draft", icon: MessageSquare, title: "Normal drafting" },
  { mode: "fast_research", label: "Fast", icon: Gauge, title: "Quick committee prep, 40+ cited source target" },
  { mode: "deep_research", label: "Deep", icon: Search, title: "Serious prep, 80+ cited source target" },
];

export function ChatInput({ value = "", onChange, onSend, mode, setMode, selectedModels, disabled = false }: ChatInputProps) {
  return (
    <div className="border-t border-[#1e2028] bg-[#08090b] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {MODES.map(({ mode: itemMode, label, icon: Icon, title }) => (
            <Button
              key={itemMode}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode(itemMode)}
              title={title}
              className={cn(
                "h-8 gap-1.5 text-xs",
                mode === itemMode ? "border border-[#3b6fd430] bg-[#3b6fd414] text-[#eeeef5]" : "text-[#6b6b82] hover:text-[#9a9ab0]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>
        <span className="max-w-[220px] truncate font-mono text-[10px] text-[#6b6b82]">
          {selectedModels.length > 0 ? `${selectedModels.length} model${selectedModels.length === 1 ? "" : "s"} selected` : "No models selected"}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          disabled={disabled}
          className="min-h-[56px] resize-none border-[#2a2d38] bg-[#111215] text-sm focus-visible:ring-[#3b6fd4]"
        />
        <Button type="button" size="icon" disabled={disabled || !value.trim()} onClick={onSend} className="h-10 w-10">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
