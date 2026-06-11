export interface ScoreableSource {
  url: string;
  title: string;
  snippet?: string;
  domain?: string;
  bucketIds?: string[];
  score?: number;
  authorityScore?: number;
}

export function selectBackupSource(candidates: ScoreableSource[], failedUrl: string, enriched: Set<string>): ScoreableSource | null {
  const failed = candidates.find((candidate) => canonical(candidate.url) === canonical(failedUrl));
  const failedBuckets = new Set(failed?.bucketIds ?? []);
  const ranked = candidates
    .filter((candidate) => candidate.url && canonical(candidate.url) !== canonical(failedUrl))
    .filter((candidate) => !enriched.has(candidate.url) && !enriched.has(canonical(candidate.url)))
    .map((candidate) => ({
      candidate,
      rank: candidateRank(candidate, failedBuckets),
    }))
    .sort((a, b) => b.rank - a.rank);
  return ranked[0]?.candidate ?? null;
}

function candidateRank(candidate: ScoreableSource, failedBuckets: Set<string>): number {
  const candidateBuckets = candidate.bucketIds ?? [];
  const overlap = candidateBuckets.filter((bucket) => failedBuckets.has(bucket)).length;
  return (candidate.score ?? candidate.authorityScore ?? authorityForDomain(candidate.domain ?? domainFromUrl(candidate.url)))
    + overlap * 20
    + Math.min(5, (candidate.snippet?.length ?? 0) / 80);
}

function authorityForDomain(domain: string): number {
  if (/sci\.gov\.in|highcourt|indiankanoon/.test(domain)) return 98;
  if (/sansad|loksabha|rajyasabha/.test(domain)) return 94;
  if (/\.gov\.in|pib\.gov\.in|eci\.gov\.in/.test(domain)) return 90;
  if (/prsindia|orfonline|cprindia/.test(domain)) return 82;
  if (/thehindu|indianexpress|scroll|thewire/.test(domain)) return 76;
  if (/blogspot|wordpress|medium|quora|reddit/.test(domain)) return 15;
  return 50;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function canonical(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href.replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
}
