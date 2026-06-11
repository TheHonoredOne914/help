import type { CoreQualityGateStatus } from "@/hooks/use-pipeline-state";
import { cn } from "@/lib/utils";

interface QualityGatePanelProps {
  gate?: CoreQualityGateStatus | null;
}

export function QualityGatePanel({ gate }: QualityGatePanelProps) {
  if (!gate) return null;

  // Fix (Bug: L11): only mark unhealthy if there are ACTUAL failures/warnings —
  // backend passed:true with empty failures should always be healthy
  const healthy =
    gate.passed === true &&
    gate.repairRequired !== true &&
    gate.automaticFailures.length === 0 &&
    gate.warnings.length === 0;

  // Fix (Bug: L12): guard formatToken against non-string values to prevent runtime crash
  const failures = gate.automaticFailures.map(safeFormatToken);
  const warnings = gate.warnings.map(safeFormatToken);
  const allTokens = [...failures, ...warnings];

  return (
    <div className={cn(
      "rounded-lg border p-2.5",
      healthy ? "border-emerald-500/25 bg-emerald-500/10" : "border-amber-300/50 bg-amber-500/10",
    )}>
      <p className={cn("text-[10px] font-semibold", healthy ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
        Quality Gate
      </p>
      <p className="mt-1 text-[12px] font-semibold text-foreground">
        {healthy ? "Passed" : gate.repairRequired ? "Repair required" : "Failed"}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Score {gate.score}
        {gate.automaticFailures.length > 0 && `, ${gate.automaticFailures.length} failure${gate.automaticFailures.length !== 1 ? "s" : ""}`}
        {gate.warnings.length > 0 && `, ${gate.warnings.length} warning${gate.warnings.length !== 1 ? "s" : ""}`}
      </p>
      {/* Fix (Bug: L29): use scrollable list instead of joining with ";" to handle long descriptions */}
      {allTokens.length > 0 && (
        <ul className="mt-1.5 max-h-20 space-y-0.5 overflow-y-auto">
          {allTokens.map((token, i) => (
            <li key={i} className="text-[10px] text-muted-foreground">
              {i < failures.length ? (
                <span className="text-red-600 dark:text-red-400">✕ {token}</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">⚠ {token}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Fix (Bug: L38): only replace single underscores — do not corrupt double underscores or prefixes
function safeFormatToken(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  // Replace underscores but preserve leading/trailing ones (some tokens use them as delimiters)
  return value.replace(/(?<![_])_(?![_])/g, " ").trim();
}
