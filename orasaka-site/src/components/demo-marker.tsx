import type { DataSource } from "@/lib/api/types";

/** Visible tag on every block whose data comes from the mock layer. */
export function DemoMarker({ source = "mock", label = "DEMO · тестовые данные" }: { source?: DataSource; label?: string }) {
  if (source !== "mock") return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-warning/60 bg-warning/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-warning">
      <span aria-hidden="true">⚠</span>
      {label}
    </span>
  );
}
