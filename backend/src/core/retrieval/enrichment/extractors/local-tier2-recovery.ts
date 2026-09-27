import { isEvidenceShell } from "../source-quality.js";
import type { ExtractorResult, Tier2RecoveryDeps } from "../types.js";
import {
  extractHeadlessWebpage,
  isLocalHeadlessExtractEnabled,
  getLocalHeadlessTimeoutMs,
  isPibHost,
  isEciHost,
  type HeadlessExtractorOptions,
} from "./headless-webpage-extractor.js";
import { extractWaybackWebpage } from "./wayback-webpage-extractor.js";

const WEAK_EXTRACT_CHARS = 300;

/** Non-PIB/ECI hosts that still dominate live snippet_fallback on bot/shell Tier-1 misses. */
const AUTO_HEADLESS_ON_BLOCK_HOST_RE = /\.gov\.in$|adrindia\.org|scobserver\.in|indiankanoon\.org|prsindia\.org/i;

/**
 * Headless is globally opt-in (`LOCAL_HEADLESS_EXTRACT`). PIB/ECI always auto-enable
 * (JS shells). Other high-value /.gov.in hosts auto-enable only when Tier-1 shows
 * bot-block or an evidence shell — otherwise wayback alone is enough and Chromium
 * would burn the enrichment budget into mass snippet_fallback.
 */
export function shouldRunHeadlessForUrl(
  url: string,
  deps: Pick<Tier2RecoveryDeps, "headlessEnabled"> = {},
  env: NodeJS.ProcessEnv = process.env,
  prior?: Pick<ExtractorResult, "error" | "text"> | null,
): boolean {
  if (deps.headlessEnabled != null) return deps.headlessEnabled;
  if (isLocalHeadlessExtractEnabled(env)) return true;
  try {
    const host = new URL(url).hostname;
    if (isPibHost(host) || isEciHost(host)) return true;
    if (!AUTO_HEADLESS_ON_BLOCK_HOST_RE.test(host)) return false;
    const blocked = isBotBlockOrChallengeError(prior?.error)
      || Boolean(prior?.text && isEvidenceShell(prior.text));
    return blocked;
  } catch {
    return false;
  }
}


export function isBotBlockOrChallengeError(error?: string | null): boolean {
  if (!error) return false;
  return /\b(403|401|429)\b/.test(error)
    || /\b(unauthorized|forbidden|too many requests|challenge|cloudflare|access denied)\b/i.test(error);
}

export function isUsableLocalExtract(result: ExtractorResult): boolean {
  const text = (result.markdown ?? result.text ?? "").replace(/\s+/g, " ").trim();
  if (result.extractionStatus !== "success" || text.length < WEAK_EXTRACT_CHARS) return false;
  if (isEvidenceShell(text)) return false;
  return true;
}

export function shouldAttemptTier2Recovery(result: ExtractorResult): boolean {
  // Any Tier-1 miss (partial junk, non-shell soft fails, bot-block, short/shell)
  // should escalate to headless/wayback — not only the old bot/shell/short triad.
  // Mid-length partial HTML that is not an evidence shell was previously skipped and
  // landed as snippet_fallback after paid extractors also missed.
  if (isUsableLocalExtract(result)) return false;
  return true;
}

export function pickBetterExtract(a: ExtractorResult, b: ExtractorResult): ExtractorResult {
  const aLen = (a.text ?? "").trim().length;
  const bLen = (b.text ?? "").trim().length;
  const aShell = a.text ? isEvidenceShell(a.text) : true;
  const bShell = b.text ? isEvidenceShell(b.text) : true;
  if (!bShell && aShell) return b;
  if (!aShell && bShell) return a;
  if (isUsableLocalExtract(b) && !isUsableLocalExtract(a)) return b;
  if (isUsableLocalExtract(a) && !isUsableLocalExtract(b)) return a;
  return bLen > aLen ? b : a;
}

/**
 * Tier 2 local recovery after Tier 1 miss:
 * a. headless (Chromium) — global opt-in, or auto for PIB/ECI / blocked high-value hosts
 * b. Wayback public archive fetch once
 * Paid extractors remain outside this helper (enrich-source path).
 */
export async function recoverLocalExtractionTier2(
  url: string,
  prior: ExtractorResult,
  options: HeadlessExtractorOptions = {},
  deps: Tier2RecoveryDeps = {},
): Promise<ExtractorResult> {
  if (!shouldAttemptTier2Recovery(prior)) return prior;

  let best = prior;
  const headlessEnabled = shouldRunHeadlessForUrl(url, deps, process.env, prior);
  if (headlessEnabled) {
    const runHeadless = deps.extractHeadless ?? extractHeadlessWebpage;
    const headless = await runHeadless(url, {
      ...options,
      timeoutMs: options.timeoutMs ?? getLocalHeadlessTimeoutMs(),
    }).catch((error): ExtractorResult => ({
      url,
      text: null,
      extractionMethod: "failed",
      extractionStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    best = pickBetterExtract(best, headless);
    if (isUsableLocalExtract(best)) return best;
  }

  const runWayback = deps.extractWayback ?? extractWaybackWebpage;
  const wayback = await runWayback(url, options).catch((error): ExtractorResult => ({
    url,
    text: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: error instanceof Error ? error.message : String(error),
  }));
  return pickBetterExtract(best, wayback);
}

export type { Tier2RecoveryDeps };
