import type { ProviderName } from "../provider-types.js";

export type CatalogProviderName = ProviderName;

export interface CatalogModel {
  id: string;
  name?: string;
  ownedBy?: string;
  badge?: string;
  contextWindow?: number;
}

export interface OpenRouterPricingHint {
  prompt?: string | number;
  completion?: string | number;
}

export interface CatalogFallbackModel {
  providerName: ProviderName;
  model: string;
}
