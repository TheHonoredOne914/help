const STEPS = ["Тариф", "Способ оплаты", "Заказ", "Ожидание оплаты", "Подтверждение"] as const;

/**
 * Where the visitor is in the payment flow. Purely navigational: the real order status always
 * comes from the server and is shown by the page content, never inferred from this indicator.
 */
export function PaymentSteps({ current, failed = false }: { current: 0 | 1 | 2 | 3 | 4; failed?: boolean }) {
  return (
    <nav aria-label="Этапы оплаты" className="mb-10">
      <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {STEPS.map((label, i) => {
          const state = i < current ? "done" : i === current ? (failed ? "failed" : "current") : "todo";
          return (
            <li key={label} aria-current={i === current ? "step" : undefined} className="min-w-0">
              <span
                aria-hidden="true"
                className={`block h-0.5 ${
                  state === "done" ? "bg-brand/70" : state === "current" ? "bg-accent shadow-[0_0_10px_rgb(255_32_53/0.7)]" : state === "failed" ? "bg-warning" : "bg-line"
                }`}
              />
              <span aria-hidden="true" className="mt-2 flex items-baseline gap-1.5">
                <span className={`font-mono text-[11px] ${state === "todo" ? "text-muted/70" : state === "failed" ? "text-warning" : "text-accent"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`hidden truncate text-xs sm:inline ${state === "todo" ? "text-muted" : "text-fg"}`}>{label}</span>
              </span>
              <span className="sr-only">
                {label}
                {state === "done" ? " — пройдено" : state === "current" ? " — текущий шаг" : state === "failed" ? " — требует внимания" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p aria-hidden="true" className="mt-3 text-sm text-fg sm:hidden">
        Шаг {current + 1} из {STEPS.length}: {STEPS[current]}
      </p>
    </nav>
  );
}
