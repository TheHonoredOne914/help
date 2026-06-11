export interface ArchiveGuardInput {
  archiveTopic?: string;
  archiveSummary?: string;
}

export interface ArchiveGuardResult {
  searchSubject: string;
  archiveUsed: boolean;
  overlapScore: number;
}

const PROMPT_STOP = new Set(["write", "prepare", "research", "analysis", "brief", "agenda", "committee", "mun", "model", "united", "nations"]);

export function buildSearchSubjectWithArchiveGuard(userQuery: string, archive: ArchiveGuardInput = {}): ArchiveGuardResult {
  const current = cleanSubject(userQuery);
  const archiveText = [archive.archiveTopic, archive.archiveSummary].filter(Boolean).join(" ");
  const archiveSubject = cleanSubject(archiveText);
  const overlapScore = scoreOverlap(current, archiveSubject);
  if (!archiveSubject || overlapScore < 0.35) {
    return { searchSubject: current || userQuery.trim().slice(0, 120), archiveUsed: false, overlapScore };
  }
  return {
    searchSubject: `${current} ${archiveSubject.split(/\s+/).slice(0, 4).join(" ")}`.replace(/\s+/g, " ").trim(),
    archiveUsed: true,
    overlapScore,
  };
}

function cleanSubject(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => word.length > 2)
    .filter((word) => !PROMPT_STOP.has(word.toLowerCase()));
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(word);
    if (selected.length >= 12) break;
  }
  return selected.join(" ");
}

function scoreOverlap(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter((word) => word.length > 3));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter((word) => word.length > 3));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  return intersection / Math.min(aWords.size, bWords.size);
}
