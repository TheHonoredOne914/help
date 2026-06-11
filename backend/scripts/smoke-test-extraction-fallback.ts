import { getExtractionProviderOrder } from "../src/core/search/search-fallback-policy.js";

const order = getExtractionProviderOrder({
  firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
  jina: Boolean(process.env.JINA_API_KEY ?? process.env.JINA_KEY),
});

console.log(`Extraction fallback order: ${order.join(" -> ")}`);
if (!process.env.FIRECRAWL_API_KEY && !(process.env.JINA_API_KEY ?? process.env.JINA_KEY)) {
  console.log("No extraction keys configured; snippet fallback is expected.");
}
