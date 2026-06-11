#!/usr/bin/env node
/**
 * Diagnostic script to verify multi-key API fallback mechanism.
 * Tests:
 * 1. Environment key loading and normalization
 * 2. Provider key extraction with multi-key joining
 * 3. MultiKeyFetch header interception
 * 4. Individual API key validation against actual providers
 */

import "dotenv/config";
import { normalizeApiKeys } from "../src/lib/normalize-keys.js";
import { extractProviderKeys } from "../src/core/providers/provider-key-extraction.js";
import { multiKeyFetch } from "../src/lib/multi-key-fetch.js";
import { logger } from "../src/lib/logger.js";

// Run normalization
normalizeApiKeys();

// Test 1: Check environment after normalization
console.log("\n=== TEST 1: Environment Keys After Normalization ===");
const groqKey = process.env.GROQ_API_KEY;
const cerebrasKey = process.env.CEREBRAS_API_KEY;
const tavilyKey = process.env.TAVILY_API_KEY;

console.log(`GROQ_API_KEY: ${groqKey ? `${groqKey.slice(0, 20)}...` : "(empty)"}`);
console.log(`  - Contains commas: ${groqKey?.includes(",")}`);
console.log(`  - Key count: ${groqKey ? groqKey.split(",").length : 0}`);

console.log(`\nCEREBRAS_API_KEY: ${cerebrasKey ? `${cerebrasKey.slice(0, 20)}...` : "(empty)"}`);
console.log(`  - Contains commas: ${cerebrasKey?.includes(",")}`);
console.log(`  - Key count: ${cerebrasKey ? cerebrasKey.split(",").length : 0}`);

console.log(`\nTAVILY_API_KEY: ${tavilyKey ? `${tavilyKey.slice(0, 20)}...` : "(empty)"}`);
console.log(`  - Contains commas: ${tavilyKey?.includes(",")}`);
console.log(`  - Key count: ${tavilyKey ? tavilyKey.split(",").length : 0}`);

// Test 2: Check extractProviderKeys
console.log("\n=== TEST 2: Provider Key Extraction ===");
const extractedKeys = extractProviderKeys({ headers: {} });

console.log(`groqKey: ${extractedKeys.groqKey ? `${extractedKeys.groqKey.slice(0, 20)}...` : "(null)"}`);
console.log(`  - Contains commas: ${extractedKeys.groqKey?.includes(",")}`);
console.log(`  - Key count: ${extractedKeys.groqKey ? extractedKeys.groqKey.split(",").length : 0}`);

console.log(`\ncerebrasKey: ${extractedKeys.cerebrasKey ? `${extractedKeys.cerebrasKey.slice(0, 20)}...` : "(null)"}`);
console.log(`  - Contains commas: ${extractedKeys.cerebrasKey?.includes(",")}`);
console.log(`  - Key count: ${extractedKeys.cerebrasKey ? extractedKeys.cerebrasKey.split(",").length : 0}`);

console.log(`\ntavilyKey: ${extractedKeys.tavilyKey ? `${extractedKeys.tavilyKey.slice(0, 20)}...` : "(null)"}`);
console.log(`  - Contains commas: ${extractedKeys.tavilyKey?.includes(",")}`);
console.log(`  - Key count: ${extractedKeys.tavilyKey ? extractedKeys.tavilyKey.split(",").length : 0}`);

// Test 3: Test multiKeyFetch header interception
console.log("\n=== TEST 3: MultiKeyFetch Header Interception ===");

// Mock fetch to see what headers multiKeyFetch creates
let requestCount = 0;
const capturedRequests: Array<{ method?: string; url: string; header: string }> = [];

const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  requestCount++;
  const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
  const auth = init?.headers instanceof Headers 
    ? init.headers.get("Authorization")
    : typeof init?.headers === "object" && init.headers
    ? (init.headers as Record<string, string>).Authorization
    : undefined;

  capturedRequests.push({
    method: init?.method ?? "GET",
    url,
    header: auth ?? "(no auth header)"
  });

  if (requestCount <= 2) {
    // Simulate 401 for first two keys
    return new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  } else if (requestCount === 3) {
    // Success on third key
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Unknown", { status: 500 });
};

// Override fetch temporarily
const originalFetch = global.fetch;
(global as any).fetch = mockFetch;

try {
  const testHeaders = {
    "Authorization": "Bearer key1,key2,key3"
  };

  console.log("Simulating API call with multi-key Authorization header:");
  console.log(`  Input: Bearer key1,key2,key3`);

  const response = await multiKeyFetch("https://api.example.com/test", {
    method: "POST",
    headers: testHeaders,
  });

  console.log(`\nResponse status: ${response.status}`);
  console.log(`\nCaptured requests (${capturedRequests.length} total):`);
  capturedRequests.forEach((req, i) => {
    console.log(`  ${i + 1}. ${req.method} ${req.url}`);
    console.log(`     Auth: ${req.header.slice(0, 30)}...`);
  });

  if (response.status === 200) {
    console.log("\n✅ Multi-key rotation worked! Third key was used successfully.");
  } else {
    console.log(`\n❌ Multi-key rotation failed. Final status: ${response.status}`);
  }
} finally {
  (global as any).fetch = originalFetch;
}

// Test 4: Test actual API calls with Groq
console.log("\n=== TEST 4: Actual Groq API Key Validation ===");

async function testGroqKey(key: string, label: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Accept": "application/json"
      }
    });

    if (response.status === 200) {
      console.log(`✅ ${label}: Valid key`);
      return true;
    } else if (response.status === 401) {
      console.log(`❌ ${label}: Invalid key (401 Unauthorized)`);
      return false;
    } else {
      console.log(`⚠️  ${label}: Unexpected status ${response.status}`);
      return false;
    }
  } catch (err) {
    console.log(`⚠️  ${label}: Network error - ${(err as Error).message}`);
    return false;
  }
}

async function validateGroqKeys() {
  if (!groqKey) {
    console.log("No GROQ_API_KEY configured");
    return;
  }

  const keys = groqKey.split(",").map(k => k.trim()).filter(Boolean);
  console.log(`Testing ${keys.length} Groq keys individually:`);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isValid = await testGroqKey(key, `Key ${i + 1}`);
    if (!isValid && i === keys.length - 1) {
      console.log("  (Last key failed - no more keys to try)");
    }
  }
}

await validateGroqKeys();

// Test 5: Test Cerebras
console.log("\n=== TEST 5: Actual Cerebras API Key Validation ===");

async function testCerebrasKey(key: string, label: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.cerebras.ai/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Accept": "application/json"
      }
    });

    if (response.status === 200) {
      console.log(`✅ ${label}: Valid key`);
      return true;
    } else if (response.status === 401) {
      console.log(`❌ ${label}: Invalid key (401 Unauthorized)`);
      return false;
    } else {
      console.log(`⚠️  ${label}: Unexpected status ${response.status}`);
      return false;
    }
  } catch (err) {
    console.log(`⚠️  ${label}: Network error - ${(err as Error).message}`);
    return false;
  }
}

async function validateCerebrasKeys() {
  if (!cerebrasKey) {
    console.log("No CEREBRAS_API_KEY configured");
    return;
  }

  const keys = cerebrasKey.split(",").map(k => k.trim()).filter(Boolean);
  console.log(`Testing ${keys.length} Cerebras keys individually:`);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isValid = await testCerebrasKey(key, `Key ${i + 1}`);
    if (!isValid && i === keys.length - 1) {
      console.log("  (Last key failed - no more keys to try)");
    }
  }
}

await validateCerebrasKeys();

console.log("\n=== DIAGNOSTIC COMPLETE ===\n");
