import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface ConversationNotFoundProps {
  onNewChat?: () => void;
}

export function ConversationNotFound({ onNewChat }: ConversationNotFoundProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 bg-[var(--paper)] p-4">
      <div className="brand-masthead">
        <h1 className="brand-masthead-title">BestDel</h1>
        <div className="order-paper-rule" aria-hidden />
      </div>

      <Card className="mx-4 w-full max-w-md border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--status-danger)]" />
            <div>
              <h2 className="text-xl font-semibold text-[var(--ink)]">Conversation not found</h2>
              <p className="mt-2 text-sm text-[var(--slate)]">
                This thread was deleted or is no longer in your archive. Start a new chat to continue.
              </p>
            </div>
          </div>
          {onNewChat ? (
            <Button className="w-full" onClick={onNewChat}>
              Start a new chat
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
