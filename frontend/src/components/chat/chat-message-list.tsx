import { ThoughtBlock, extractThinking } from "./thought-block";
import { ResearchAnswerBody } from "./research-answer-body";
import type { PipelineMetadata } from "@/lib/pipeline-metadata";
import type { CitationMessageSource } from "./citation-parts";

export type { CitationMessageSource, CitationPart } from "./citation-parts";
export {
  buildCitationParts,
  cleanMessageContent,
  prepareMessageForCopy,
} from "./citation-parts";

export function CitationMessage({
  content,
  sources = [],
  citationStatus = null,
}: {
  content: string;
  sources?: CitationMessageSource[];
  citationStatus?: PipelineMetadata["citationStatus"] | null;
}) {
  const { thinking, mainContent: contentWithoutThinking, isThinkingFinished } = extractThinking(content, { streamEnded: true });

  return (
    <div className="prose prose-sm max-w-none text-[var(--ink)] dark:prose-invert">
      {thinking && <ThoughtBlock thinking={thinking} isThinkingFinished={isThinkingFinished} />}
      <ResearchAnswerBody
        content={contentWithoutThinking}
        sources={sources}
        citationStatus={citationStatus}
      />
    </div>
  );
}
