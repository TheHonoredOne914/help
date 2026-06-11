export function safeHostname(url: string | null | undefined): string {
  if (!url?.trim()) return "unknown";
  try {
    const parsedUrl = new URL(url);
    // FIX BUG-77: Only allow http and https protocols to prevent XSS attacks
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return "unknown";
    }
    return parsedUrl.hostname.replace(/^www\./, "") || "unknown";
  } catch {
    return "unknown";
  }
}

export function safeDomainKey(url: string | null | undefined, fallback = "unknown"): string {
  const host = safeHostname(url);
  return host === "unknown" ? fallback || "unknown" : host;
}
