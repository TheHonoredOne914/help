import { useEffect, useRef, useState } from "react";

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
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

export function StreamingText({ content, isStreaming }: StreamingTextProps) {
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

  return (
    <div className="streaming-fade space-y-3" aria-live="polite" aria-atomic="false">
      {visibleChunks.map((chunk, index) => (
        // Fix (Bug: L68): Use content hash + position for key to avoid collisions on repetitive bullets
        <div
          key={`${index}-${chunk.length}-${chunk.charCodeAt(0) ?? 0}`}
          className="stream-chunk whitespace-pre-wrap"
        >
          {chunk}
        </div>
      ))}
    </div>
  );
}
