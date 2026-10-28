import { describe, expect, it } from "vitest";
import { isAllowedOrigin, parseSiteOrigin } from "../src/lib/server/origin";

describe("parseSiteOrigin", () => {
  it("accepts bare https origins and loopback http", () => {
    expect(parseSiteOrigin("https://orasaka.example")).toBe("https://orasaka.example");
    expect(parseSiteOrigin("https://orasaka.example/")).toBe("https://orasaka.example");
    expect(parseSiteOrigin("https://orasaka.example:8443")).toBe("https://orasaka.example:8443");
    expect(parseSiteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(parseSiteOrigin("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100");
  });

  it("rejects non-origins and plain http on public hosts", () => {
    for (const bad of ["", "orasaka.example", "http://orasaka.example", "https://orasaka.example/app", "https://u:p@orasaka.example", "https://orasaka.example/?x=1", "ftp://orasaka.example", "null"]) {
      expect(parseSiteOrigin(bad), bad).toBeNull();
    }
  });
});

describe("isAllowedOrigin with SITE_ORIGIN", () => {
  const site = "https://orasaka.example";
  it("allows exactly the configured origin", () => {
    expect(isAllowedOrigin("https://orasaka.example", "orasaka.example", site)).toBe(true);
    // Host is irrelevant when SITE_ORIGIN is configured (proxy may rewrite it).
    expect(isAllowedOrigin("https://orasaka.example", "internal:8080", site)).toBe(true);
  });

  it.each([
    ["missing", null],
    ["null", "null"],
    ["malformed", "https//orasaka.example"],
    ["with path", "https://orasaka.example/x"],
    ["foreign", "https://evil.example"],
    ["subdomain", "https://a.orasaka.example"],
    ["suffix trick", "https://orasaka.example.evil.example"],
    ["other scheme", "http://orasaka.example"],
    ["other port", "https://orasaka.example:444"],
  ])("rejects %s origin", (_, origin) => {
    expect(isAllowedOrigin(origin, "orasaka.example", site)).toBe(false);
  });
});

describe("isAllowedOrigin without SITE_ORIGIN (local development)", () => {
  it("allows matching loopback http origin", () => {
    expect(isAllowedOrigin("http://localhost:3000", "localhost:3000", null)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3100", "127.0.0.1:3100", null)).toBe(true);
    expect(isAllowedOrigin("http://[::1]:3000", "[::1]:3000", null)).toBe(true);
  });

  it.each([
    ["missing", null, "localhost:3000"],
    ["null", "null", "localhost:3000"],
    ["https vs http", "https://localhost:3000", "localhost:3000"],
    ["other port", "http://localhost:3001", "localhost:3000"],
    ["other loopback name", "http://127.0.0.1:3000", "localhost:3000"],
    ["foreign origin", "http://evil.example", "localhost:3000"],
    ["public host without SITE_ORIGIN", "http://orasaka.example", "orasaka.example"],
    ["public https host without SITE_ORIGIN", "https://orasaka.example", "orasaka.example"],
    ["missing host", "http://localhost:3000", null],
    ["host with path injection", "http://localhost:3000", "localhost:3000/x"],
  ])("rejects %s", (_, origin, host) => {
    expect(isAllowedOrigin(origin, host, null)).toBe(false);
  });
});
