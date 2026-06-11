import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { SourceUsagePolicy } from "../../config/source-usage-policy.js";
import type { EvidenceRegistryCore } from "../evidence-registry.js";
import { validateSourceUsageMap } from "./validate-source-usage-map.js";
import type { ModelRoleOutput, SourceUsageAggregateValidation } from "./types.js";

export function aggregateSourceUsageValidation(
  outputs: ModelRoleOutput[],
  evidenceRegistry: EvidenceRegistryCore,
  agendaContract: AgendaContract,
  policy: SourceUsagePolicy,
): SourceUsageAggregateValidation {
  const failureReports = outputs.map((output) => output.sourceUsageFailureReport).filter((report): report is NonNullable<ModelRoleOutput["sourceUsageFailureReport"]> => Boolean(report));
  const validUsedSourceIds = new Set<number>();
  let rolesPassed = 0;
  let strongSourceCount = 0;
  let mediumSourceCount = 0;
  let weakSourceCount = 0;
  let snippetSourceCount = 0;
  let invalidSourceCount = 0;
  const perRoleValidation = outputs.map((output) => {
    const required = Math.min(output.minimumSourceRequirement ?? policy.perRoleMinimum, evidenceRegistry.getCitationEligibleCount());
    const report = validateSourceUsageMap(output, evidenceRegistry, agendaContract, required, {}, policy.allowDeterministicExtractionFallback);
    report.usedSourceIds.forEach((sourceId) => validUsedSourceIds.add(sourceId));
    if (report.passed) rolesPassed += 1;
    strongSourceCount += report.strongSourceCount;
    mediumSourceCount += report.mediumSourceCount;
    weakSourceCount += report.weakSourceCount;
    snippetSourceCount += report.snippetSourceCount;
    invalidSourceCount += report.invalidSourceCount;
    return {
      roleName: output.roleName,
      passed: report.passed,
      usedSourceIds: report.usedSourceIds,
      rejectedSourceIds: report.rejectedSourceIds,
      failures: report.failures,
      warnings: report.warnings,
      structuredFailures: report.structuredFailures,
      strongSourceCount: report.strongSourceCount,
      mediumSourceCount: report.mediumSourceCount,
      weakSourceCount: report.weakSourceCount,
      snippetSourceCount: report.snippetSourceCount,
    };
  });
  const validUsageCount = validUsedSourceIds.size;
  const rolesFailed = outputs.length - rolesPassed;
  const warningRoleCount = failureReports.length + perRoleValidation.filter((role) => role.warnings.length > 0).length;
  const required = Math.min(policy.requiredSources, evidenceRegistry.getCitationEligibleCount());
  const unionMeetsFinalFloor = validUsageCount >= required;
  const requiredPassingRoles = requiredRolePassCount(outputs.length, policy);
  const roleRequirementPassed = rolesPassed >= requiredPassingRoles;
  const strictPassed = roleRequirementPassed && unionMeetsFinalFloor;
  const nonStrictPassed = roleRequirementPassed && unionMeetsFinalFloor;
  return {
    outputs,
    failureReports,
    validUsageCount,
    validUsedSourceIds: [...validUsedSourceIds].sort((a, b) => a - b),
    rolesPassed,
    rolesFailed,
    warningRoleCount,
    passed: policy.strictFailure ? strictPassed : nonStrictPassed,
    completedWithSourceGaps: (!strictPassed || rolesFailed > 0) && unionMeetsFinalFloor,
    perRoleValidation,
    strongSourceCount,
    mediumSourceCount,
    weakSourceCount,
    snippetSourceCount,
    invalidSourceCount,
  };
}

function requiredRolePassCount(outputCount: number, policy: SourceUsagePolicy): number {
  if (outputCount === 0) return 0;
  if (policy.strictFailure) return outputCount;
  if (policy.roleCount >= 4) return Math.min(outputCount, 2);
  return 1;
}
