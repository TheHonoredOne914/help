/**
 * Optional live smoke for Tier 2 local recovery (PIB 403 / ECI JS shell).
 * Requires LOCAL_HEADLESS_EXTRACT=true and Playwright Chromium.
  * Does not print secrets.
 */
import { extract as extractWebpage } from "../src/core/retrieval/enrichment/extractors/webpage-extractor.js";
import { recoverLocalExtractionTier2, shouldAttemptTier2Recovery } from "../src/core/retrieval/enrichment/extractors/local-tier2-recovery.js";
import { isLocalHeadlessExtractEnabled, getLocalHeadlessTimeoutMs } from "../src/core/retrieval/enrichment/extractors/headless-webpage-extractor.js";

type Grade = "A" | "B" | "C" | "F";

function grade(text: string | null | undefined, method: string, error?: string): Grade {
  const len = (text ?? "").trim().length;
  if (len >= 800) return "A";
  if (len >= 300) return "B";
  if (len >= 120) return "C";
  if (error || method === "failed") return "F";
  return "F";
}

const TARGETS = [
  { name: "PIB press release (legacy PRID)", url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2000000" },
  { name: "PIB press release PRID 2087859", url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2087859" },
  { name: "ECI homepage", url: "https://www.eci.gov.in/" },
];

async function runOne(name: string, url: string) {
  const tier1 = await extractWebpage(url, { timeoutMs: 15000 }).catch((error) => ({
    url,
    text: null,
    extractionMethod: "failed",
    extractionStatus: "failed",
    error: error instanceof Error ? error.message : String(error),
  }));
  const tier1Grade = grade(tier1.text, tier1.extractionMethod, tier1.error);
  let tier2 = tier1;
  let usedTier2 = false;
  if (shouldAttemptTier2Recovery(tier1)) {
    usedTier2 = true;
    tier2 = await recoverLocalExtractionTier2(url, tier1, {
      timeoutMs: getLocalHeadlessTimeoutMs(),
    });
  }
  const tier2Grade = grade(tier2.text, tier2.extractionMethod, tier2.error);
  return {
    name,
    url,
    headlessEnabled: isLocalHeadlessExtractEnabled(),
    usedTier2,
    tier1: {
      method: tier1.extractionMethod,
      status: tier1.extractionStatus,
      chars: (tier1.text ?? "").trim().length,
      grade: tier1Grade,
      error: tier1.error ? String(tier1.error).slice(0, 160) : undefined,
    },
    tier2: {
      method: tier2.extractionMethod,
      status: tier2.extractionStatus,
      chars: (tier2.text ?? "").trim().length,
      grade: tier2Grade,
      error: tier2.error ? String(tier2.error).slice(0, 160) : undefined,
    },
  };
}

async function main() {
  console.log(JSON.stringify({
    LOCAL_HEADLESS_EXTRACT: isLocalHeadlessExtractEnabled(),
    LOCAL_HEADLESS_TIMEOUT_MS: getLocalHeadlessTimeoutMs(),
  }));
  const rows = [] as unknown[];
  for (const t of TARGETS) {
    try {
      rows.push(await runOne(t.name, t.url));
    } catch (error) {
      rows.push({
        name: t.name,
        url: t.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
