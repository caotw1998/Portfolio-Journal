import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const compose = readFileSync("compose.yaml", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const verifier = readFileSync("script/verify-private-deployment.sh", "utf8");

describe("private deployment artifacts", () => {
  test("binds only the app loopback port and never publishes PostgreSQL", () => {
    expect(compose).toContain("127.0.0.1:${APP_PORT:-3000}:3000");
    expect(compose).not.toMatch(/-\s*(?:0\.0\.0\.0:)?5432:5432/);
    expect(compose).toContain("postgres_data:/var/lib/postgresql");
  });

  test("gates app startup on migrations and applies container hardening", () => {
    expect(compose).toContain("condition: service_completed_successfully");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain("worker:");
    expect(compose).toContain("SYNC_WORKER_TOKEN: ${SYNC_WORKER_TOKEN}");
  });

  test("uses a non-root standalone runtime image", () => {
    expect(dockerfile).toMatch(/FROM node:24-bookworm-slim@sha256:[a-f0-9]{64} AS runner/);
    expect(dockerfile.match(/apt-get install --yes --no-install-recommends openssl/g)).toHaveLength(2);
    expect(dockerfile).toContain("/app/.next/standalone");
    expect(dockerfile).toContain("USER nextjs");
  });

  test("excludes secrets and personal research snapshots from Git and Docker", () => {
    expect(gitignore).toContain("/data/*.snapshot.json");
    expect(gitignore).toContain("*.dump");
    expect(dockerignore).toContain(".env*");
    expect(dockerignore).toContain("data/*.snapshot.json");
  });

  test("provides repeatable runtime security and persistence verification", () => {
    expect(verifier).toContain("NETWORK_BINDING_OK");
    expect(verifier).toContain("require_service worker");
    expect(verifier).toContain("CONTAINER_HARDENING_OK");
    expect(verifier).toContain("TAILSCALE_PRIVATE_ACCESS_OK");
    expect(verifier).toContain("VERIFY_RESTART");
    expect(verifier).toContain("PRIVATE_DEPLOYMENT_VERIFIED");
  });

  test("rejects unauthenticated React Server Component and segment-prefetch requests", () => {
    expect(verifier).toContain("missing_identity_rsc");
    expect(verifier).toContain("missing_identity_segment_prefetch");
    expect(verifier).toContain("Next-Router-Segment-Prefetch");
  });
});
