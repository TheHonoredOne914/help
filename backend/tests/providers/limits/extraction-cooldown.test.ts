import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  createExtractionCooldown,
  recordExtractionFailure,
  shouldSkipExtractionProvider,
  EXTRACTION_TIMEOUT_THRESHOLD,
} from "../../../src/core/providers/limits/extraction-cooldown.js";

describe("extraction cooldown", () => {
  it("should start with no cooldowns", () => {
    const state = createExtractionCooldown();
    assert.equal(state.firecrawlTimeoutCount, 0);
    assert.equal(state.jinaTimeoutCount, 0);
    assert.equal(state.firecrawlCooledDown, false);
    assert.equal(state.jinaCooledDown, false);
    assert.equal(state.jina422Urls.size, 0);
  });

  it("should cool down firecrawl after 3 timeouts", () => {
    const state = createExtractionCooldown();
    recordExtractionFailure(state, "firecrawl", 504, "https://example.com/1");
    recordExtractionFailure(state, "firecrawl", 504, "https://example.com/2");
    assert.equal(state.firecrawlCooledDown, false);
    recordExtractionFailure(state, "firecrawl", 504, "https://example.com/3");
    assert.equal(state.firecrawlCooledDown, true);
    assert.equal(shouldSkipExtractionProvider(state, "firecrawl"), true);
  });

  it("should cool down jina after 3 timeouts", () => {
    const state = createExtractionCooldown();
    recordExtractionFailure(state, "jina", 504, "https://example.com/1");
    recordExtractionFailure(state, "jina", 500, "https://example.com/2");
    recordExtractionFailure(state, "jina", 504, "https://example.com/3");
    assert.equal(state.jinaCooledDown, true);
    assert.equal(shouldSkipExtractionProvider(state, "jina"), true);
  });

  it("should not retry same URL after Jina 422", () => {
    const state = createExtractionCooldown();
    const url = "https://example.com/bad-url";
    recordExtractionFailure(state, "jina", 422, url);
    assert.equal(state.jina422Urls.has(url), true);
    assert.equal(shouldSkipExtractionProvider(state, "jina", url), true);
    assert.equal(shouldSkipExtractionProvider(state, "jina", "https://other.com"), false);
  });

  it("should cool down immediately on 429", () => {
    const state = createExtractionCooldown();
    recordExtractionFailure(state, "firecrawl", 429);
    assert.equal(state.firecrawlCooledDown, true);
    recordExtractionFailure(state, "jina", 429);
    assert.equal(state.jinaCooledDown, true);
  });

  it("should cool down immediately on provider auth or quota errors", () => {
    const state = createExtractionCooldown();
    recordExtractionFailure(state, "firecrawl", 402);
    assert.equal(state.firecrawlCooledDown, true);
    recordExtractionFailure(state, "jina", 403);
    assert.equal(state.jinaCooledDown, true);
  });

  it("should not cool down on successful responses", () => {
    const state = createExtractionCooldown();
    recordExtractionFailure(state, "firecrawl", 200);
    assert.equal(state.firecrawlCooledDown, false);
    assert.equal(state.firecrawlTimeoutCount, 0);
  });
});
