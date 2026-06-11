import { jinaExtractorProvider } from "../../../search/providers/jina-extractor-provider.js";
import type { ExtractorOptions, ExtractorResult } from "../types.js";

export async function extract(url: string, options: ExtractorOptions = {}): Promise<ExtractorResult> {
  try {
    const result = await jinaExtractorProvider.extract(url, { jina: options.jinaKey }, {
      fetchFn: options.fetchFn,
      timeoutMs: options.timeoutMs,
      snippet: options.snippet,
      abortSignal: options.abortSignal,
    });
    return {
      url: result.url,
      title: result.title,
      text: result.text ?? result.markdown ?? result.excerpt ?? null,
      markdown: result.markdown ?? null,
      extractionMethod: "jina_reader",
      extractionProvider: "jina",
      extractionStatus: result.status,
      fallbackExtractionUsed: Boolean(result.metadata?.fallbackExtractionUsed),
      error: result.error,
    };
  } catch (error) {
    return {
      url,
      text: null,
      extractionMethod: "failed",
      extractionProvider: "jina",
      extractionStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
