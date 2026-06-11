import { isResearchTerminalStatus } from "../../run-state/run-status-machine.js";

export class TerminalWriteGuard {
  private terminalWritten = false;
  private blockedWrites = 0;

  canWrite(payload: Record<string, unknown>): boolean {
    if (this.terminalWritten) {
      if (payload.diagnosticSafe === true) return true;
      this.blockedWrites += 1;
      return false;
    }
    const status = payload.terminalStatus ?? payload.eventType;
    if (isResearchTerminalStatus(status)) this.terminalWritten = true;
    return true;
  }

  get diagnostics(): { terminalWritten: boolean; blockedWrites: number } {
    return { terminalWritten: this.terminalWritten, blockedWrites: this.blockedWrites };
  }
}
