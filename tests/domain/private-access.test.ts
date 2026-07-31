import { describe, expect, test } from "vitest";
import { evaluatePrivateAccess, SECURITY_HEADERS } from "@/lib/deployment/private-access";

function request(method = "GET", headers: Record<string, string> = {}, pathname = "/research") {
  return { method, pathname, headers: new Headers(headers) };
}

const productionEnvironment = {
  NODE_ENV: "production",
  PRIVATE_ACCESS_MODE: "tailscale",
  TAILSCALE_ALLOWED_LOGIN: "owner@example.com",
  APP_ORIGIN: "https://portfolio.example-tailnet.ts.net",
};

describe("private production access", () => {
  test("allows development and health checks without proxy identity", () => {
    expect(evaluatePrivateAccess(request(), { NODE_ENV: "development" })).toEqual({ allowed: true });
    expect(evaluatePrivateAccess(request("GET", {}, "/api/health"), productionEnvironment)).toEqual({ allowed: true });
  });

  test("fails closed when production access configuration or identity is missing", () => {
    expect(evaluatePrivateAccess(request(), { NODE_ENV: "production" })).toMatchObject({ allowed: false, status: 503 });
    expect(evaluatePrivateAccess(request(), productionEnvironment)).toMatchObject({ allowed: false, status: 401 });
  });

  test("rejects a different Tailscale login and accepts the configured owner", () => {
    expect(evaluatePrivateAccess(request("GET", { "tailscale-user-login": "other@example.com" }), productionEnvironment)).toMatchObject({ allowed: false, status: 403 });
    expect(evaluatePrivateAccess(request("GET", { "tailscale-user-login": "OWNER@example.com" }), productionEnvironment)).toEqual({ allowed: true });
  });

  test("requires an exact same origin for writes", () => {
    const identity = { "tailscale-user-login": "owner@example.com" };
    expect(evaluatePrivateAccess(request("POST", identity, "/api/funds"), productionEnvironment)).toMatchObject({ allowed: false, status: 403 });
    expect(evaluatePrivateAccess(request("POST", { ...identity, origin: "https://evil.example" }, "/api/funds"), productionEnvironment)).toMatchObject({ allowed: false, status: 403 });
    expect(evaluatePrivateAccess(request("POST", { ...identity, origin: productionEnvironment.APP_ORIGIN }, "/api/funds"), productionEnvironment)).toEqual({ allowed: true });
  });

  test("rejects oversized or malformed declared request bodies", () => {
    const headers = { "tailscale-user-login": "owner@example.com", origin: productionEnvironment.APP_ORIGIN };
    expect(evaluatePrivateAccess(request("PATCH", { ...headers, "content-length": String(1024 * 1024 + 1) }, "/api/me"), productionEnvironment)).toMatchObject({ allowed: false, status: 413 });
    expect(evaluatePrivateAccess(request("PATCH", { ...headers, "content-length": "unknown" }, "/api/me"), productionEnvironment)).toMatchObject({ allowed: false, status: 413 });
  });

  test("defines defensive browser headers", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });
});
