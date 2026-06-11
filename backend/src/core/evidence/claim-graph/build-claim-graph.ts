import type { AgendaContract } from "../../agenda/agenda-contract.js";
import type { EvidenceRegistryCore } from "../evidence-registry.js";
import { dedupeClaims } from "./claim-deduper.js";
import { extractRegistryClaims } from "./claim-extractor.js";
import { attachCounterclaims, buildCounterclaims } from "./counterclaim-builder.js";
import { attachContradictions, detectContradictions } from "./contradiction-detector.js";
import { ingestEvidenceCardClaims } from "./evidence-card-claim-ingestor.js";
import { ingestSourceUsageClaims } from "./source-usage-claim-ingestor.js";
import { buildClaimGraphSummary } from "./telemetry.js";
import type { BuildClaimGraphOptions, ClaimGraph, ClaimGraphBuildContext } from "./types.js";

export function buildClaimGraph(registry: EvidenceRegistryCore, contract: AgendaContract, options: BuildClaimGraphOptions = {}): ClaimGraph {
  const context = buildContext(registry, contract, options);
  const registryClaims = extractRegistryClaims(context);
  const evidenceCardClaims = ingestEvidenceCardClaims(context);
  const sourceUsageClaims = ingestSourceUsageClaims(context);
  const rawClaims = [...registryClaims, ...evidenceCardClaims, ...sourceUsageClaims];
  let claims = dedupeClaims(rawClaims);
  const counterclaims = buildCounterclaims(rawClaims, claims);
  claims = attachCounterclaims(claims, counterclaims);
  const contradictions = detectContradictions(claims);
  claims = attachContradictions(claims, contradictions);
  const graph: ClaimGraph = {
    claims,
    counterclaims,
    contradictions,
    diagnostics: {
      registryClaimCount: registryClaims.length,
      evidenceCardClaimCount: evidenceCardClaims.length,
      sourceUsageClaimCount: sourceUsageClaims.length,
      dedupedClaimCount: claims.length,
      rejectedSourceClaimCount: claims.filter((claim) => claim.validationStatus === "rejected" || claim.sourceTrace?.some((trace) => trace.validationStatus === "rejected")).length,
      carefulLanguageClaimCount: claims.filter((claim) => claim.mustUseCarefulLanguage).length,
      promptEligibleClaimCount: claims.filter((claim) => (claim.supportScore ?? 0) >= 40 && claim.validationStatus !== "rejected").length,
    },
  };
  graph.summary = buildClaimGraphSummary(graph);
  return graph;
}

function buildContext(registry: EvidenceRegistryCore, contract: AgendaContract, options: BuildClaimGraphOptions): ClaimGraphBuildContext {
  const approvedSourceIds = new Set<number>([
    ...(options.sourceUsageAggregate?.validUsedSourceIds ?? []),
    ...(options.validationReports ?? []).flatMap((report) => report.approvedSourceIds),
    ...(options.sourceUsageAggregate?.perRoleValidation ?? []).flatMap((role) => role.usedSourceIds),
  ]);
  const rejectedSourceIds = new Set<number>([
    ...(options.validationReports ?? []).flatMap((report) => report.rejectedSourceIds),
    ...(options.sourceUsageAggregate?.perRoleValidation ?? []).flatMap((role) => role.rejectedSourceIds),
  ]);
  return { registry, contract, options, approvedSourceIds, rejectedSourceIds };
}
