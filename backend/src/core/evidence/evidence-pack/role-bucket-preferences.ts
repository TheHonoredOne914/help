import type { SourceBucketId } from "../../retrieval/source-buckets.js";
import type { SourceClass } from "../evidence-registry-types.js";
import type { RolePackStrategy } from "./types.js";

export const LEGAL_BUCKETS: SourceBucketId[] = ["court_legal", "legal_commentary", "parliamentary_records", "government_official"];
export const DATA_BUCKETS: SourceBucketId[] = ["government_official", "democracy_index", "electoral_integrity", "digital_rights", "press_freedom", "academic_research", "policy_research"];
export const POLICY_BUCKETS: SourceBucketId[] = ["government_official", "policy_research", "academic_research", "parliamentary_records", "indian_major_media"];
export const WATCHDOG_BUCKETS: SourceBucketId[] = ["human_rights_watchdog", "civic_space", "press_freedom", "digital_rights", "democracy_index"];

export const LEGAL_CLASSES: SourceClass[] = ["court_primary", "legal_commentary", "parliamentary_records", "official_government", "electoral_body"];
export const DATA_CLASSES: SourceClass[] = ["official_government", "electoral_body", "democracy_index", "academic_journal", "policy_research", "press_freedom_index"];
export const POLICY_CLASSES: SourceClass[] = ["official_government", "parliamentary_records", "policy_research", "academic_journal", "indian_major_media"];
export const CITATION_SAFE_CLASSES: SourceClass[] = ["court_primary", "official_government", "parliamentary_records", "electoral_body", "legal_commentary", "policy_research", "academic_journal", "democracy_index"];

export function safeDefaultStrategy(roleName: string): RolePackStrategy {
  return {
    id: "safe_default",
    label: "Safe default evidence strategy",
    preferredBuckets: ["government_official", "parliamentary_records", "court_legal", "policy_research", "academic_research", "indian_major_media"],
    preferredSourceClasses: ["official_government", "parliamentary_records", "court_primary", "policy_research", "academic_journal", "indian_major_media"],
    preferDiversity: true,
    preferCitationStrength: true,
    safeDefault: true,
    warning: `Unknown role "${roleName}" used safe default evidence strategy.`,
  };
}
