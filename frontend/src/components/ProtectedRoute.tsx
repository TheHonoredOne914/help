import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!loading && !session) {
      navigate("/auth");
    }
  }, [session, loading, navigate]);

  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--slate)]" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-[var(--paper)] p-4">
        <div className="brand-masthead">
          <h1 className="brand-masthead-title">BestDel</h1>
          <div className="order-paper-rule" aria-hidden />
        </div>
        <Card className="mx-4 w-full max-w-md border-[var(--line)] bg-[var(--surface)] shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-xl font-semibold text-[var(--ink)]">Sign in required</h2>
              <p className="mt-2 text-sm text-[var(--slate)]">
                Sign in to open the research desk.
              </p>
            </div>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
