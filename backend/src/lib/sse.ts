import { TerminalWriteGuard } from "../core/streaming/run-stream/terminal-write-guard.js";

interface WritableSseResponse {
  writableEnded?: boolean;
  destroyed?: boolean;
  write: (chunk: string) => unknown;
  end: () => unknown;
}

interface TerminalErrorPayload {
  error: string;
  code: string;
  retryable: boolean;
}

export function createSseWriter(res: WritableSseResponse) {
  let eventSeq = 0;
  const guard = new TerminalWriteGuard();

  const sendEvent = (data: Record<string, unknown>): void => {
    if (res.writableEnded || res.destroyed) return;
    if (!guard.canWrite(data)) return;
    const id = ++eventSeq;
    res.write(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const finishStream = (): void => {
    if (res.writableEnded) return;
    if (!guard.diagnostics.terminalWritten) sendEvent({ done: true });
    res.end();
  };

  const sendTerminalError = (payload: TerminalErrorPayload): void => {
    if (res.writableEnded) return;
    sendEvent({ ...payload });
    finishStream();
  };

  return {
    sendEvent,
    finishStream,
    sendTerminalError,
    diagnostics: () => guard.diagnostics,
  };
}
