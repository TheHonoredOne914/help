export type SourceBucket = "gov" | "court" | "intl" | "media" | "academic";

export type SourceTier = "tier1" | "tier2" | "tier3" | "tier4" | "tier5" | "untiered";

export interface SourceSemanticsInput {
  url?: string;
  sourceType?: string;
}

export interface SourceBadgeInfo {
  label: string;
  className: string;
}

export interface SourceSemantics {
  badge: SourceBadgeInfo;
  tier: SourceTier;
  borderClass: string;
  bucket: SourceBucket;
}

function normaliseUrl(url?: string): string {
  return (url ?? "").toLowerCase();
}

export function isCourtSource(input: SourceSemanticsInput): boolean {
  const u = normaliseUrl(input.url);
  return (
    input.sourceType === "court_judgement" ||
    input.sourceType === "court_primary" ||
    u.includes("indiankanoon.org") ||
    u.includes("sci.gov.in") ||
    u.includes("scobserver.in")
  );
}

export function classifySourceBucket(input: SourceSemanticsInput): SourceBucket {
  const u = normaliseUrl(input.url);
  if (isCourtSource(input)) return "court";

  if (
    u.includes(".gov.in") ||
    u.includes("sansad.in") ||
    u.includes("legislative.gov.in") ||
    u.includes("prsindia.org") ||
    input.sourceType === "government_india" ||
    input.sourceType === "official_government" ||
    input.sourceType === "parliamentary_records" ||
    input.sourceType === "electoral_body"
  ) {
    return "gov";
  }

  if (
    input.sourceType === "government_international" ||
    input.sourceType === "international_research" ||
    input.sourceType === "comparative_democracy" ||
    input.sourceType === "democracy_index" ||
    input.sourceType === "human_rights_watchdog" ||
    input.sourceType === "press_freedom_index" ||
    u.includes("un.org") ||
    u.includes("worldbank.org") ||
    u.includes(".un.") ||
    u.includes("undp.org") ||
    u.includes("unicef.org") ||
    u.includes("who.int") ||
    u.includes("imf.org")
  ) {
    return "intl";
  }

  if (
    u.includes(".ac.in") ||
    u.includes(".edu.in") ||
    input.sourceType === "academic" ||
    input.sourceType === "academic_india" ||
    input.sourceType === "academic_journal"
  ) {
    return "academic";
  }

  return "media";
}

export function inferSourceTier(input: SourceSemanticsInput): SourceTier {
  const u = normaliseUrl(input.url);
  if (isCourtSource(input)) return "tier1";
  if (
    input.sourceType === "official_government" ||
    input.sourceType === "parliamentary_records" ||
    input.sourceType === "electoral_body" ||
    u.includes("cag.gov.in") ||
    u.includes("ncrb.gov.in") ||
    u.includes("pib.gov.in") ||
    u.includes("prsindia.org") ||
    u.includes("sansad.in")
  ) {
    return "tier2";
  }
  if (
    u.includes("rbi.org.in") ||
    u.includes("niti.gov.in") ||
    u.includes("mospi.gov.in") ||
    u.includes("censusindia.gov.in")
  ) {
    return "tier3";
  }
  if (
    input.sourceType === "academic_journal" ||
    input.sourceType === "legal_commentary" ||
    input.sourceType === "policy_research" ||
    u.includes("epw.in") ||
    u.includes("idsa.in") ||
    u.includes("cprindia.org") ||
    u.includes("orfonline.org")
  ) {
    return "tier4";
  }
  if (
    input.sourceType === "comparative_democracy" ||
    input.sourceType === "government_international" ||
    input.sourceType === "international_research"
  ) {
    return "tier5";
  }
  return "untiered";
}

export function tierBorderClass(tier: SourceTier): string {
  switch (tier) {
    case "tier1":
      return "border-amber-500/50";
    case "tier2":
      return "border-[color-mix(in_srgb,var(--navy)_45%,transparent)]";
    case "tier3":
      return "border-[color-mix(in_srgb,var(--navy)_35%,transparent)]";
    case "tier4":
      return "border-[color-mix(in_srgb,var(--navy)_30%,transparent)]";
    case "tier5":
      return "border-slate-500/35";
    default:
      return "border-[var(--line)]/30";
  }
}

export function getSourceBadge(input: SourceSemanticsInput): SourceBadgeInfo {
  const u = normaliseUrl(input.url);
  if (u.includes("cag.gov.in")) return { label: "CAG", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
  if (u.includes("ncrb.gov.in")) return { label: "NCRB", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
  if (u.includes("pib.gov.in")) return { label: "PIB", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
  if (u.includes("indiankanoon.org") || u.includes("sci.gov.in")) {
    return {
      label: "COURT",
      className:
        "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)] dark:bg-[var(--brass)]/12 text-amber-700 dark:text-amber-400 border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] dark:border-[var(--brass)]/35",
    };
  }
  if (u.includes("livelaw.in") || u.includes("barandbench.com")) {
    return {
      label: "LEGAL NEWS",
      className:
        "bg-orange-50 dark:bg-orange-500/12 text-orange-700 dark:text-orange-300 border border-orange-300/50 dark:border-orange-500/35",
    };
  }
  if (u.includes(".gov.in")) {
    return { label: "GOV.IN", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
  }

  switch (input.sourceType) {
    case "government_india":
    case "official_government":
      return {
        label: "GOV.IN",
        className:
          "bg-[color-mix(in_srgb,var(--navy)_8%,transparent)] dark:bg-[var(--navy)]/12 text-[var(--navy)] border border-[color-mix(in_srgb,var(--navy)_30%,transparent)] dark:border-[var(--navy)]/35",
      };
    case "parliamentary_records":
      return {
        label: "PARL",
        className:
          "bg-[color-mix(in_srgb,var(--navy)_8%,transparent)] dark:bg-[var(--navy)]/12 text-[var(--navy)] border border-[color-mix(in_srgb,var(--navy)_30%,transparent)] dark:border-[var(--navy)]/35",
      };
    case "court_judgement":
    case "court_primary":
      return {
        label: "COURT",
        className:
          "bg-[color-mix(in_srgb,var(--brass)_8%,transparent)] dark:bg-[var(--brass)]/12 text-amber-700 dark:text-amber-400 border border-[color-mix(in_srgb,var(--brass)_30%,transparent)] dark:border-[var(--brass)]/35",
      };
    case "legal_commentary":
      return {
        label: "LEGAL",
        className:
          "bg-orange-50 dark:bg-orange-500/12 text-orange-700 dark:text-orange-300 border border-orange-300/50 dark:border-orange-500/35",
      };
    case "electoral_body":
      return { label: "ECI", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "democracy_index":
      return { label: "INDEX", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "human_rights_watchdog":
    case "civic_space_monitor":
      return { label: "WATCH", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "digital_rights_watchdog":
      return { label: "RIGHTS", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "press_freedom_index":
      return { label: "PRESS", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "government_international":
    case "international_research":
    case "comparative_democracy":
      return { label: "INTL", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "academic_india":
    case "academic_journal":
      return {
        label: "ACAD",
        className:
          "bg-[color-mix(in_srgb,var(--navy)_8%,transparent)] dark:bg-[var(--navy)]/12 text-[var(--navy)] border border-[color-mix(in_srgb,var(--navy)_30%,transparent)] dark:border-[var(--navy)]/35",
      };
    case "indian_major_media":
      return { label: "MEDIA", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "policy_research":
      return { label: "POLICY", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "social_media":
      return { label: "SOCIAL", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "low_quality":
      return { label: "LOW", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
    case "general_media":
    default:
      return { label: "WEB", className: "bg-[var(--surface-muted)] text-[var(--slate)] border border-[var(--line)]" };
  }
}

export function getSourceSemantics(input: SourceSemanticsInput): SourceSemantics {
  const tier = inferSourceTier(input);
  return {
    badge: getSourceBadge(input),
    tier,
    borderClass: tierBorderClass(tier),
    bucket: classifySourceBucket(input),
  };
}

/** Short badge label for compact displays (source panel chips). */
export function sourceBadgeLabel(sourceType?: string): string {
  return getSourceBadge({ sourceType }).label;
}
