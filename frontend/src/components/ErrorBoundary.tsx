import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[BestDel] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
          <div className="max-w-md space-y-3 p-6 border border-border rounded-lg">
            <h2 className="text-lg font-semibold text-destructive">BestDel encountered an error</h2>
            <p className="text-sm text-muted-foreground font-mono">
              {this.state.error?.message ?? "Unknown error"}
            </p>
            <button
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:opacity-90"
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
