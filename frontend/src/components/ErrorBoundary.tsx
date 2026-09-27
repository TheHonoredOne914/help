import { Component, type ReactNode, type ErrorInfo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

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
        <div className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-[var(--paper)] p-4">
          <div className="brand-masthead">
            <h1 className="brand-masthead-title">BestDel</h1>
            <div className="order-paper-rule" aria-hidden />
          </div>

          <Card className="mx-4 w-full max-w-md border-[var(--line)] bg-[var(--surface)] shadow-sm">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--status-danger)]" />
                <div>
                  <h2 className="text-xl font-semibold text-[var(--ink)]">Something went wrong</h2>
                  <p className="mt-2 text-sm text-[var(--slate)]">
                    BestDel hit an unexpected error. Reload the desk to continue.
                  </p>
                  {this.state.error?.message ? (
                    <p className="mt-3 font-mono text-xs text-[var(--slate)]">{this.state.error.message}</p>
                  ) : null}
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              >
                Reload the desk
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
