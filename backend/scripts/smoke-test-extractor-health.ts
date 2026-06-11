import "dotenv/config";
import { normalizeApiKeys } from "../src/lib/normalize-keys.js";
import { buildSearchProviderStatus } from "../src/core/search/search-provider-status.js";

normalizeApiKeys();

const keys = {
  serper: process.env.SERPER_API_KEY,
  exa: process.env.EXA_API_KEY,
  tavily: process.env.TAVILY_API_KEY,
  brave: process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY,
  firecrawl: process.env.FIRECRAWL_API_KEY,
  jina: process.env.JINA_API_KEY ?? process.env.JINA_KEY,
  scraperapi: process.env.SCRAPERAPI_KEY,
  zenrows: process.env.ZENROWS_API_KEY,
  scrapingbee: process.env.SCRAPINGBEE_API_KEY,
  geekflare: process.env.GEEKFLARE_API_KEY,
};

const statuses = await buildSearchProviderStatus(keys, {
  timeoutMs: Number(process.env.PROVIDER_STATUS_TIMEOUT_MS ?? 10_000),
  bypassCache: true,
  configuredFrom: {
    firecrawl: process.env.FIRECRAWL_API_KEY ? "server_env" : "none",
    jina: process.env.JINA_API_KEY || process.env.JINA_KEY ? "server_env" : "none",
    scraperapi: process.env.SCRAPERAPI_KEY ? "server_env" : "none",
    zenrows: process.env.ZENROWS_API_KEY ? "server_env" : "none",
    scrapingbee: process.env.SCRAPINGBEE_API_KEY ? "server_env" : "none",
    geekflare: process.env.GEEKFLARE_API_KEY ? "server_env" : "none",
  },
});

console.log("Extractor provider status:");
for (const provider of ["firecrawl", "jina", "scraperapi", "zenrows", "scrapingbee", "geekflare"] as const) {
  const status = statuses[provider];
  if (!status) continue;
  console.log([
    `- ${provider}`,
    `configured=${status.configured}`,
    `healthy=${status.healthy}`,
    `status=${status.status}`,
    `canExtract=${status.canExtract}`,
    `source=${status.configuredFrom ?? "none"}`,
    status.latencyMs !== undefined ? `latencyMs=${status.latencyMs}` : null,
  ].filter(Boolean).join(" "));
}
