export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable = true,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

export function normalizePipelineError(error: unknown): PipelineError {
  if (error instanceof PipelineError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PipelineError(message, "pipeline_unknown_error", true);
}
