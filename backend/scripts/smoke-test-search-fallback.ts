import { getSearchProviderOrder } from "../src/core/search/search-fallback-policy.js";

const available = {
  serper: Boolean(process.env.SERPER_API_KEY),
  exa: Boolean(process.env.EXA_API_KEY),
  tavily: Boolean(process.env.TAVILY_API_KEY),
  brave: Boolean(process.env.BRAVE_API_KEY ?? process.env.BRAVE_KEY),
};

for (const mode of ["fast_research", "web_search", "deep_research", "deep_research", "council"] as const) {
  const order = getSearchProviderOrder(mode, available);
  console.log(`${mode}: ${order.length ? order.join(" -> ") : "no live search provider configured"}`);
}
