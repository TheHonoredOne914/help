import type { SourceContractStatus, SourceGapReportSummary } from "@/hooks/use-pipeline-state";
import { cn } from "@/lib/utils";

interface SourceContractPanelProps {
  contract?: SourceContractStatus | null;
  gapReport?: SourceGapReportSummary | null;
}

export function SourceContractPanel({ contract, gapReport }: SourceContractPanelProps) {
  if (!contract && !gapReport) return null;

  const roleCount = contract?.roles.length ?? 0;
  const passedRoles = contract?.roles.filter((role) => role.passed).length ?? 0;

  // Fix (Bug: L14): only show warning when there are ACTUAL failed/weak buckets,
  // not just because a gapReport exists
  const failedBuckets = gapReport?.failedBuckets ?? [];
  const weakBuckets = gapReport?.weakBuckets ?? [];
  const hasActualGap =
    failedBuckets.length > 0 ||
    weakBuckets.length > 0 ||
    (contract?.roles.some((role) => !role.passed) ?? false);

  return (
    <div className={cn(
      "rounded-lg border p-2.5",
      hasActualGap ? "border-amber-300/50 bg-amber-500/10" : "border-border/40 bg-background/70",
    )}>
      <p className={cn("text-[10px] font-semibold", hasActualGap ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
        Source Contract
      </p>
      {contract && (
        <>
          <p className="mt-1 text-[12px] font-semibold text-foreground">
            {contract.citationEligibleSources} eligible / {contract.requiredUniqueCitedSources} cited target
          </p>
          {/* Fix (Bug: L12): guard against division by zero when roleCount is 0 */}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {roleCount > 0
              ? `${passedRoles}/${roleCount} roles passed, ${contract.requiredEvidenceCardsPerModel} cards each`
              : `${contract.requiredEvidenceCardsPerModel} evidence cards required`}
          </p>
        </>
      )}
      {/* Fix (Bug: L36): show gap details even when contract is null */}
      {gapReport && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Available {gapReport.availableCitationEligibleSources}/{gapReport.requiredUniqueSources}.{" "}
          {gapReport.explanation || "Targets were not fully met."}
        </p>
      )}
      {(failedBuckets.length > 0 || weakBuckets.length > 0) && (
        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
          {/* Fix: buckets already use replace in render — join with ", " and wrap */}
          Buckets: {[...failedBuckets, ...weakBuckets]
            .map((bucket) => bucket.replace(/_/g, " "))
            .join(" · ")}
        </p>
      )}
      {contract?.roles.some((role) => !role.passed) && (
        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
          {/* Fix (Bug: L46): format technical role codes to be human-readable */}
          Missing: {contract.roles
            .filter((role) => !role.passed)
            .map((role) => role.sourceGapReason || formatRoleName(role.roleName))
            .join("; ")}
        </p>
      )}
    </div>
  );
}

/** Fix (Bug: L46): convert snake_case role codes to Title Case for display */
function formatRoleName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
