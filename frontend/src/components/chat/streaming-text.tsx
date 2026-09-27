import { useEffect, useRef, useState } from "react";
import { ResearchAnswerBody } from "./research-answer-body";
import type { CitationMessageSource } from "./citation-parts";
import type { PipelineMetadata } from "@/lib/pipeline-metadata";

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
  sources?: CitationMessageSource[];
  citationStatus?: PipelineMetadata["citationStatus"] | null;
}

// Fix (Bug: L10): Avoid splitting Indian citations like "A.I.R. 2026 S.C. 1"
// Fix (Bug: L12): Preserve line-breaks needed for bullet formatting
function splitIntoStableChunks(content: string): string[] {
  // Split on double newlines (paragraph breaks) only — do not split on sentence boundaries
  // to avoid breaking Indian legal citations (A.I.R., S.C., etc.)
  const paragraphs = content.split(/\n{2,}/);
  const result: string[] = [];
  for (const para of paragraphs) {
    if (para.trim()) {
      result.push(para);
    } else {
      // Preserve blank paragraphs as a newline spacer so bullet points render correctly
      result.push("\n");
    }
  }
  return result;
}

export function StreamingText({
  content,
  isStreaming,
  sources = [],
  citationStatus = null,
}: StreamingTextProps) {
  // Fix (Bug: L16): Only recalculate chunks when content actually changes length,
  // not on every character — use a stable ref to avoid thrashing on every tick
  const chunksRef = useRef<string[]>([]);
  const prevLengthRef = useRef(0);

  if (content.length !== prevLengthRef.current) {
    chunksRef.current = splitIntoStableChunks(content);
    prevLengthRef.current = content.length;
  }
  const chunks = chunksRef.current;

  const [visibleCount, setVisibleCount] = useState(0);
  const visibleCountRef = useRef(visibleCount);
  const rafRef = useRef<number | null>(null);
  visibleCountRef.current = visibleCount;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      setVisibleCount(chunks.length);
      return;
    }

    if (chunks.length === 0) {
      setVisibleCount(0);
      return;
    }

    const tick = () => {
      setVisibleCount((prev) => {
        if (prev >= chunks.length) {
          rafRef.current = null;
          return prev;
        }
        // Fix (Bug: L40): Adaptive delay — faster when there are many chunks to catch up
        const remaining = chunks.length - prev;
        const delay = remaining > 5 ? 30 : 55;
        timerRef.current = window.setTimeout(() => {
          rafRef.current = requestAnimationFrame(tick);
        }, delay);
        return prev + 1;
      });
    };

    if (visibleCountRef.current < chunks.length && rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [chunks.length, isStreaming]);

  const visibleChunks = chunks.slice(0, visibleCount);
  // Completed paragraphs as markdown; keep the in-flight tail as plain stream text.
  const completedCount = isStreaming ? Math.max(0, visibleChunks.length - 1) : visibleChunks.length;
  const completed = visibleChunks.slice(0, completedCount);
  const inFlight = isStreaming ? visibleChunks[visibleChunks.length - 1] : undefined;
  const completedMarkdown = completed.filter((c) => c !== "\n").join("\n\n");

  return (
    <div className="streaming-fade space-y-3" aria-live="polite" aria-atomic="false">
      {completedMarkdown ? (
        <ResearchAnswerBody
          content={completedMarkdown}
          sources={sources}
          citationStatus={citationStatus}
          hideSourcesFooter
        />
      ) : null}
      {inFlight != null && inFlight !== "\n" && (
        <div className="stream-chunk whitespace-pre-wrap">{inFlight}</div>
      )}
    </div>
  );
}
