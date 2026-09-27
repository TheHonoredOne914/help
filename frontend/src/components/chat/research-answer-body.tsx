import { isValidElement, useId, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  buildCitationParts,
  cleanMessageContent,
  splitSourcesSection,
  type CitationMessageSource,
} from "./citation-parts";
import { BestdelChartBlock } from "./bestdel-chart";
import type { PipelineMetadata } from "@/lib/pipeline-metadata";
import { cn } from "@/lib/utils";
import { hostFromUrl } from "@/lib/host-from-url";

export interface ResearchAnswerBodyProps {
  content: string;
  sources?: CitationMessageSource[];
  citationStatus?: PipelineMetadata["citationStatus"] | null;
  className?: string;
  /** When true, skip Sources footer (e.g. live rail already shows sources). */
  hideSourcesFooter?: boolean;
}

function sourceRowDomId(scope: string, n: string | number) {
  return `source-row-${scope}-${n}`;
}

function scrollToSourceRow(scope: string, n: string) {
  const el = document.getElementById(sourceRowDomId(scope, n)) ?? document.getElementById(`source-row-${n}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  el.classList.add("source-row-flash");
  window.setTimeout(() => el.classList.remove("source-row-flash"), 1200);
}

function proseHref(href?: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed || trimmed === "#") return undefined;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined;
  if (trimmed.includes(".")) return `https://${trimmed.replace(/^\/\//, "")}`;
  return undefined;
}

/** Rebuild markdown so citations become `[N](url)` links for chip rendering. */
export function citationPartsToMarkdown(
  content: string,
  sources: CitationMessageSource[] = [],
  citationStatus?: PipelineMetadata["citationStatus"] | null,
): { markdown: string; sourcesBlock: string | null } {
  const safeContent = cleanMessageContent(content);
  const { body, sourcesBlock } = splitSourcesSection(safeContent);
  const parts = buildCitationParts({ content: body, sources, citationStatus });
  const markdown = parts
    .map((part) => (part.type === "source" ? `[${part.n}](${part.url})` : part.text))
    .join("");
  return { markdown, sourcesBlock };
}

function CitationChip({ n, href, title, scope }: { n: string; href: string; title?: string; scope: string }) {
  return (
    <button
      type="button"
      className="citation-chip mx-0.5 inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
      title={title || `Source ${n}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = document.getElementById(sourceRowDomId(scope, n)) ?? document.getElementById(`source-row-${n}`);
        if (el) {
          scrollToSourceRow(scope, n);
          return;
        }
        if (href && href !== "#") window.open(href, "_blank", "noopener,noreferrer");
      }}
      aria-label={`Source ${n}${title ? `: ${title}` : ""}`}
    >
      [{n}]
    </button>
  );
}

const CHART_FENCE_LANGUAGE = /language-(?:bestdel-)?chart\b/;

function isChartFenceClassName(className?: string | null): boolean {
  return CHART_FENCE_LANGUAGE.test(className ?? "");
}

function chartFenceRawText(children: ReactNode): string {
  return String(children ?? "").replace(/\n$/, "");
}

function isCitationLink(children: ReactNode): string | null {
  const text = Array.isArray(children)
    ? children.map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : "")).join("")
    : typeof children === "string" || typeof children === "number"
      ? String(children)
      : "";
  const match = text.trim().match(/^\[?(\d{1,3})\]?$/);
  return match ? match[1] : null;
}

export function ResearchAnswerBody({
  content,
  sources = [],
  citationStatus = null,
  className,
  hideSourcesFooter = false,
}: ResearchAnswerBodyProps) {
  const sourceScope = useId().replace(/:/g, "");
  const { markdown, sourcesBlock } = useMemo(
    () => citationPartsToMarkdown(content, sources, citationStatus),
    [citationStatus, content, sources],
  );

  const sourceById = useMemo(() => {
    const map = new Map<number, CitationMessageSource>();
    sources.forEach((source, index) => {
      if (source.url) map.set(source.sourceId ?? index + 1, source);
    });
    return map;
  }, [sources]);

  const sourceLines = sourcesBlock
    ? sourcesBlock
        .trim()
        .split("\n")
        .filter((l) => l.trim().length > 0)
    : [];

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children, ...rest }) => {
        const n = isCitationLink(children);
        const safeHref = proseHref(href);
        if (n && safeHref && /^https?:\/\//i.test(safeHref)) {
          const meta = sourceById.get(Number(n));
          return <CitationChip n={n} href={safeHref} title={meta?.title || undefined} scope={sourceScope} />;
        }
        if (!safeHref) {
          return <span>{children}</span>;
        }
        return (
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="research-answer-link"
            onClick={(e) => e.stopPropagation()}
            {...rest}
          >
            {children}
          </a>
        );
      },
      code: ({ className, children, ...rest }) => {
        if (isChartFenceClassName(className)) {
          return <BestdelChartBlock raw={chartFenceRawText(children)} />;
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
      pre: ({ children }) => {
        const child = Array.isArray(children) ? children[0] : children;
        if (isValidElement(child)) {
          const codeProps = child.props as { className?: string; children?: ReactNode };
          if (isChartFenceClassName(codeProps.className)) {
            return <BestdelChartBlock raw={chartFenceRawText(codeProps.children)} />;
          }
        }
        return <pre>{children}</pre>;
      },
    }),
    [sourceById, sourceScope],
  );

  const footerSources = sources.filter((s) => s.url || s.title);
  const showFooter =
    !hideSourcesFooter &&
    (footerSources.length > 0 || (sourcesBlock && sourceLines.length > 0));

  return (
    <div className={cn("research-answer", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
      {showFooter && (
        <details className="research-answer-sources not-prose mt-4 overflow-hidden rounded-md border border-[var(--line)]">
          <summary className="cursor-pointer select-none bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]">
            Sources ({footerSources.length || sourceLines.length})
          </summary>
          <div className="space-y-2 p-3">
            {footerSources.length > 0
              ? footerSources.map((s, i) => {
                  const id = s.sourceId ?? i + 1;
                  const domain = s.url ? hostFromUrl(s.url) : "";
                  return (
                    <div
                      key={`${id}-${s.url || i}`}
                      id={sourceRowDomId(sourceScope, id)}
                      className="flex items-start gap-2 text-xs text-[var(--slate)]"
                    >
                      <span className="shrink-0 font-mono text-[var(--navy)]">[{id}]</span>
                      <div className="min-w-0">
                        <p className="break-words font-medium text-[var(--ink)]">{s.title || domain || s.url || "Source"}</p>
                        {domain && <p className="truncate text-2xs text-[var(--slate)]">{domain}</p>}
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-block text-2xs font-medium text-[var(--navy)] hover:underline"
                          >
                            Open original
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              : sourceLines.map((line, i) => {
                  const urlMatch = line.match(/https?:\/\/[^\s)>\]]+/);
                  const url = urlMatch?.[0]?.replace(/[),.;\]]+$/, "");
                  const originalIndex = line.match(/^\[?(\d+)\]?\.?\s/)?.[1];
                  const id = Number(originalIndex ?? i + 1);
                  const meta = sourceById.get(id);
                  const label = originalIndex ? `[${originalIndex}]` : `[${i + 1}]`;
                  const domain = url ? hostFromUrl(url) : meta?.url ? hostFromUrl(meta.url) : "";
                  const title =
                    meta?.title ||
                    line
                      .replace(/^\[?\d+\]?\.?\s*/, "")
                      .replace(/https?:\/\/[^\s)>\]]+/g, "")
                      .replace(/\s*[—–-]\s*$/, "")
                      .trim() ||
                    domain ||
                    url ||
                    "Source";
                  const href = url || meta?.url;

                  return (
                    <div
                      key={i}
                      id={sourceRowDomId(sourceScope, id)}
                      className="flex items-start gap-2 text-xs text-[var(--slate)]"
                    >
                      <span className="shrink-0 font-mono text-[var(--navy)]">{label}</span>
                      <div className="min-w-0">
                        <p className="break-words font-medium text-[var(--ink)]">{title}</p>
                        {domain && <p className="truncate text-2xs text-[var(--slate)]">{domain}</p>}
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-block text-2xs font-medium text-[var(--navy)] hover:underline"
                          >
                            Open original
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
          </div>
        </details>
      )}
    </div>
  );
}
