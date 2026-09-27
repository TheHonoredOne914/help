import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type BestdelChartSeries = { key: string; label?: string };
export type BestdelChartSpec = {
  type: "bar" | "line" | "pie";
  title?: string;
  xKey: string;
  series: BestdelChartSeries[];
  data: Record<string, string | number>[];
  cite?: number;
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const MAX_ROWS = 24;
const MAX_SERIES = 4;

function sanitizeSeriesKey(key: string): string | null {
  const cleaned = key.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function coerceChartNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/%$/, "").replace(/,/g, "");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse + validate a bestdel-chart fenced JSON block. Returns null on failure. */
export function parseBestdelChartSpec(raw: string): BestdelChartSpec | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BestdelChartSpec>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.type !== "bar" && parsed.type !== "line" && parsed.type !== "pie") return null;
    if (typeof parsed.xKey !== "string" || !parsed.xKey.trim()) return null;
    if (!Array.isArray(parsed.series) || parsed.series.length === 0) return null;
    if (!Array.isArray(parsed.data) || parsed.data.length === 0) return null;

    const series: { key: string; rawKey: string; label?: string }[] = [];
    for (const item of parsed.series) {
      if (series.length >= MAX_SERIES) break;
      if (!item || typeof item.key !== "string") continue;
      const key = sanitizeSeriesKey(item.key);
      if (!key) continue;
      series.push({
        key,
        rawKey: item.key.trim(),
        ...(typeof item.label === "string" ? { label: item.label } : {}),
      });
    }
    if (series.length === 0) return null;

    const data = parsed.data.slice(0, MAX_ROWS).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const next: Record<string, string | number> = { ...row };
      for (const seriesItem of series) {
        const raw = row[seriesItem.rawKey] ?? row[seriesItem.key];
        const numeric = coerceChartNumber(raw);
        if (numeric != null) next[seriesItem.key] = numeric;
        if (seriesItem.rawKey !== seriesItem.key) delete next[seriesItem.rawKey];
      }
      return [next];
    });
    if (data.length === 0) return null;

    return {
      type: parsed.type,
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 120) : undefined,
      xKey: parsed.xKey.trim(),
      series: series.map(({ key, label }) => ({ key, label })),
      data,
      cite: typeof parsed.cite === "number" && Number.isFinite(parsed.cite) ? parsed.cite : undefined,
    };
  } catch {
    return null;
  }
}

function buildConfig(series: BestdelChartSeries[]): ChartConfig {
  const config: ChartConfig = {};
  series.forEach((s, i) => {
    config[s.key] = {
      label: s.label || s.key,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });
  return config;
}

export function BestdelChartBlock({
  raw,
  className,
}: {
  raw: string;
  className?: string;
}) {
  const spec = useMemo(() => parseBestdelChartSpec(raw), [raw]);

  if (!spec) {
    return (
      <pre className={cn("overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--surface-muted)]/40 p-3 text-xs", className)}>
        <code>{raw}</code>
      </pre>
    );
  }

  const config = buildConfig(spec.series);
  const valueKey = spec.series[0]!.key;

  const chart =
    spec.type === "bar" ? (
      <BarChart data={spec.data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {spec.series.length > 1 ? <Legend /> : null}
        {spec.series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${sanitizeSeriesKey(s.key) ?? "series"})`} radius={4} />
        ))}
      </BarChart>
    ) : spec.type === "line" ? (
      <LineChart data={spec.data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {spec.series.length > 1 ? <Legend /> : null}
        {spec.series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={`var(--color-${sanitizeSeriesKey(s.key) ?? "series"})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    ) : (
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey={spec.xKey} />} />
        <Pie data={spec.data} dataKey={valueKey} nameKey={spec.xKey} innerRadius={48} outerRadius={80} strokeWidth={2}>
          {spec.data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Legend />
      </PieChart>
    );

  return (
    <figure className={cn("not-prose my-4 space-y-2", className)} data-bestdel-chart={spec.type}>
      {(spec.title || spec.cite != null) ? (
        <figcaption className="text-sm font-semibold text-[var(--ink)]">
          {spec.title}
          {spec.cite != null ? (
            <span className={cn("text-xs font-normal text-[var(--slate)]", spec.title ? "ml-2" : undefined)}>[Source {spec.cite}]</span>
          ) : null}
        </figcaption>
      ) : null}
      <ChartContainer
        config={config}
        className={cn(
          "aspect-[16/9] w-full max-h-72 rounded-md border border-[var(--line)] bg-[var(--paper)] p-3 text-[var(--slate)]",
          "[&_.recharts-cartesian-axis-tick_text]:fill-[var(--slate)]",
          "[&_.recharts-cartesian-grid_line]:stroke-[var(--line)]",
          "[&_.recharts-legend-item-text]:fill-[var(--ink)]",
          "[&_.recharts-default-legend]:text-xs",
        )}
      >
        {chart}
      </ChartContainer>
    </figure>
  );
}
