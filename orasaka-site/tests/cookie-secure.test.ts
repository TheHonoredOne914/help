import { describe, expect, it } from "vitest";
import { sessionCookieSecure, type SessionCookieSecureInput } from "../src/lib/server/cookie-secure";

const base: SessionCookieSecureInput = {
  siteOrigin: "https://orasaka.example",
  siteMode: "demo",
  trustProxy: false,
  hostname: "orasaka.example",
  protocol: "https:",
  forwardedProto: null,
};

describe("sessionCookieSecure", () => {
  it("keeps Secure when a client sends x-forwarded-proto: http under a public HTTPS origin", () => {
    expect(sessionCookieSecure({ ...base, forwardedProto: "http", protocol: "http:", trustProxy: false })).toBe(true);
    expect(sessionCookieSecure({ ...base, forwardedProto: "http", protocol: "http:", trustProxy: true })).toBe(true);
    expect(sessionCookieSecure({ ...base, forwardedProto: "http, https", hostname: "127.0.0.1", protocol: "http:" })).toBe(true);
  });

  it("allows a non-Secure cookie only for local demo over plain HTTP", () => {
    expect(
      sessionCookieSecure({
        siteOrigin: "",
        siteMode: "demo",
        trustProxy: false,
        hostname: "localhost",
        protocol: "http:",
        forwardedProto: "https",
      }),
    ).toBe(false);
    expect(
      sessionCookieSecure({
        siteOrigin: "http://127.0.0.1:3100",
        siteMode: "demo",
        trustProxy: false,
        hostname: "127.0.0.1",
        protocol: "http:",
        forwardedProto: "http",
      }),
    ).toBe(false);
  });

  it("stays Secure for live mode, https origins, and any non-loopback host", () => {
    expect(
      sessionCookieSecure({
        siteOrigin: "",
        siteMode: "live",
        trustProxy: false,
        hostname: "localhost",
        protocol: "http:",
        forwardedProto: "http",
      }),
    ).toBe(true);
    expect(
      sessionCookieSecure({
        siteOrigin: "",
        siteMode: "public",
        trustProxy: false,
        hostname: "localhost",
        protocol: "http:",
        forwardedProto: "http",
      }),
    ).toBe(false);
    expect(
      sessionCookieSecure({
        siteOrigin: "https://orasaka.example",
        siteMode: "public",
        trustProxy: false,
        hostname: "localhost",
        protocol: "http:",
        forwardedProto: "http",
      }),
    ).toBe(true);
    expect(
      sessionCookieSecure({
        siteOrigin: "",
        siteMode: "public",
        trustProxy: true,
        hostname: "localhost",
        protocol: "http:",
        forwardedProto: "http",
      }),
    ).toBe(true);
    expect(
      sessionCookieSecure({
        siteOrigin: "",
        siteMode: "demo",
        trustProxy: false,
        hostname: "orasaka.example",
        protocol: "http:",
        forwardedProto: "http",
      }),
    ).toBe(true);
  });

  it("reads X-Forwarded-Proto only when the proxy is trusted to overwrite it", () => {
    const local: SessionCookieSecureInput = {
      siteOrigin: "",
      siteMode: "demo",
      trustProxy: true,
      hostname: "localhost",
      protocol: "http:",
      forwardedProto: "https",
    };
    expect(sessionCookieSecure(local)).toBe(true);
    expect(sessionCookieSecure({ ...local, forwardedProto: "http" })).toBe(false);
    expect(sessionCookieSecure({ ...local, trustProxy: false, forwardedProto: "https" })).toBe(false);
  });
});
