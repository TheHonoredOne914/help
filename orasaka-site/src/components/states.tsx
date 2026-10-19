import { API_ERROR_MESSAGE, type ApiErrorCode } from "@/lib/api/types";
import { brand } from "@/config/brand";
import { Button, ExternalButton } from "./ui";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none ${className}`} />;
}

export function LoadingCards({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-6">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="mt-6 h-9 w-2/3" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-8 h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiErrorCode; onRetry?: () => void }) {
  const isAuth = error === "unauthorized" || error === "forbidden";
  return (
    <div role="alert" className="rounded-xl border border-accent/40 bg-accent/5 p-6">
      <p className="flex items-start gap-3 font-semibold">
        <span aria-hidden="true" className="text-accent">✕</span>
        {isAuth ? "Нет доступа" : "Не удалось загрузить данные"}
      </p>
      <p className="mt-2 text-sm text-muted">{API_ERROR_MESSAGE[error]}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {onRetry && !isAuth ? (
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        ) : null}
        <ExternalButton href={brand.telegramBot.url} variant={isAuth ? "primary" : "ghost"}>
          Открыть бота
        </ExternalButton>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/50 p-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-3 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}
