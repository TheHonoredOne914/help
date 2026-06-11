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
};

const statuses = await buildSearchProviderStatus(keys, { timeoutMs: 6000, bypassCache: true });
console.log("Search/extraction provider status:");
for (const provider of ["serper", "exa", "tavily", "brave", "firecrawl", "jina"]) {
  const status = statuses[provider];
  if (!status) continue;
  console.log(`- ${provider}: status=${status.status} configured=${status.configured} healthy=${status.healthy} canSearch=${status.canSearch} canExtract=${status.canExtract}`);
}
