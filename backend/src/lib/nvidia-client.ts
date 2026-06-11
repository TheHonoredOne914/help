import OpenAI from "openai";
import { multiKeyFetch } from "./multi-key-fetch.js";

/**
 * NVIDIA NIM (NVIDIA Inference Microservices) client.
 *
 * Uses the OpenAI-compatible chat-completions API exposed by NVIDIA at
 * https://integrate.api.nvidia.com/v1. Requires a valid NVIDIA API key
 * set via the NVIDIA_API_KEY environment variable (or override per-call
 * via the `apiKey` argument to `getNvidiaClient`).
 *
 * Docs: https://docs.api.nvidia.com/nim/reference/models
 */

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function isNvidiaEnabled(overrideKey?: string | null): boolean {
  return Boolean(overrideKey ?? process.env.NVIDIA_API_KEY);
}

export function getNvidiaClient(overrideKey?: string | null): OpenAI {
  const apiKey = overrideKey ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NVIDIA_API_KEY is not configured. Set NVIDIA_API_KEY in your environment or provide an override key.",
    );
  }
  return new OpenAI({
    baseURL: NVIDIA_BASE_URL,
    apiKey,
    fetch: multiKeyFetch as any,
  });
}

export const nvidiaEnabled = !!process.env.NVIDIA_API_KEY;

// Default shared client (lazy — only instantiated when NVIDIA_API_KEY is set).
export const nvidiaClient: OpenAI | null = process.env.NVIDIA_API_KEY
  ? new OpenAI({
      baseURL: NVIDIA_BASE_URL,
      apiKey: process.env.NVIDIA_API_KEY,
      fetch: multiKeyFetch as any,
    })
  : null;
