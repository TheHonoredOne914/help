import type { SourceUsageFailureType, SourceUsageMapItem, StructuredSourceUsageFailure } from "./types.js";

export function sourceUsageFailure(
  type: SourceUsageFailureType,
  roleName: string,
  detail: string,
  item?: Pick<SourceUsageMapItem, "sourceId" | "usageType">,
  severity: "error" | "warning" = "error",
): StructuredSourceUsageFailure {
  return {
    type,
    sourceId: item?.sourceId,
    roleName,
    usageType: item?.usageType,
    severity,
    detail,
  };
}

export function failureToString(failure: StructuredSourceUsageFailure): string {
  switch (failure.type) {
    case "fake_source_id":
      return `fake source id ${failure.sourceId}`;
    case "cross_batch_reference":
      return `cross-batch source id ${failure.sourceId} was not assigned to ${failure.roleName}`;
    case "invalid_usage_type":
      return `invalid usageType for source ${failure.sourceId}`;
    case "title_only_source":
      return `title-only source ${failure.sourceId} cannot count as extracted evidence`;
    case "boilerplate_claim":
      return `boilerplate text cannot count as evidence for source ${failure.sourceId}`;
    case "ungrounded_claim":
      return `claim for source ${failure.sourceId} is not grounded in registry evidence`;
    case "ineligible_source":
      return `ineligible source ${failure.sourceId} cannot count as evidence`;
    case "weak_source_not_counted":
      return `weak source ${failure.sourceId} does not satisfy strict source usage`;
    case "snippet_source_not_counted":
      return `snippet-only source ${failure.sourceId} does not satisfy strict source usage`;
    case "failed_source":
      return `failed extraction source ${failure.sourceId} cannot count as evidence`;
    case "unsupported_legal_holding":
      return `legal_holding_extracted requires legal source class for source ${failure.sourceId}`;
    case "listing_only":
      return `listing source ids without actual extraction/support does not count for source ${failure.sourceId}`;
    case "missing_required_field":
      return failure.detail;
    case "repeated_generic_claim":
      return failure.detail;
    case "used_ids_mismatch":
      return failure.detail;
    case "insufficient_valid_sources":
      return failure.detail;
    case "insufficient_bucket_coverage":
      return failure.detail;
    case "all_sources_weak":
      return "listing source ids without actual extraction/support does not count";
  }
}

export function splitFailureMessages(failures: StructuredSourceUsageFailure[]): { failures: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const failure of failures) {
    const text = failureToString(failure);
    if (failure.severity === "warning") warnings.push(text);
    else errors.push(text);
  }
  return { failures: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
