import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-8 overflow-y-auto bg-[var(--paper)] p-4">
      <div className="brand-masthead">
        <h1 className="brand-masthead-title">BestDel</h1>
        <div className="order-paper-rule" aria-hidden />
      </div>

      <Card className="mx-4 w-full max-w-md border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--status-danger)]" />
            <div>
              <h2 className="text-xl font-semibold text-[var(--ink)]">Page not found</h2>
              <p className="mt-2 text-sm text-[var(--slate)]">
                This route is not in the app. Return to the research desk to continue.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/chat">Open the desk</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">Back to BestDel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
