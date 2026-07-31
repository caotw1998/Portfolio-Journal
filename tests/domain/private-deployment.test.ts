import { createRequire } from "node:module";
import { describe, expect, test, vi } from "vitest";

const require = createRequire(import.meta.url);
const { validateDeploymentEnvironment } = require("../../script/deploy-check.js") as {
  validateDeploymentEnvironment(environment: Record<string, string | undefined>, workingDirectory?: string): string[];
};
const { bootstrapWorkspace, normalizeWorkspaceEmail } = require("../../script/bootstrap-workspace.js") as {
  bootstrapWorkspace(prisma: { user: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }, email: string): Promise<{ action: string; user: { email: string } }>;
  normalizeWorkspaceEmail(value: string | undefined): string;
};
const { buildDeploymentEnvironment } = require("../../script/init-private-deployment.js") as {
  buildDeploymentEnvironment(input: { workspaceEmail: string; tailscaleLogin: string; appOrigin: string; backupRoot: string }, workingDirectory?: string): string;
};

const validEnvironment = {
  POSTGRES_DB: "portfolio_journal",
  POSTGRES_USER: "portfolio",
  POSTGRES_PASSWORD: "0123456789abcdef0123456789abcdef",
  WORKSPACE_EMAIL: "owner@example.com",
  TAILSCALE_ALLOWED_LOGIN: "owner@example.com",
  APP_ORIGIN: "https://portfolio.example-tailnet.ts.net",
  APP_PORT: "3000",
  BACKUP_ROOT: "/srv/portfolio-journal-backups",
};

describe("private deployment configuration", () => {
  test("accepts a complete private deployment configuration", () => {
    expect(validateDeploymentEnvironment(validEnvironment, "/workspace/portfolio-journal")).toEqual([]);
  });

  test("rejects weak secrets, public-origin mistakes and repository-local backups", () => {
    const errors = validateDeploymentEnvironment({
      ...validEnvironment,
      POSTGRES_PASSWORD: "password",
      POSTGRES_DB: "unsafe-name",
      APP_ORIGIN: "http://localhost:3000/path",
      BACKUP_ROOT: "/workspace/portfolio-journal/backups",
    }, "/workspace/portfolio-journal");
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("POSTGRES_PASSWORD"),
      expect.stringContaining("POSTGRES_DB"),
      expect.stringContaining("APP_ORIGIN"),
      expect.stringContaining("BACKUP_ROOT"),
    ]));
  });

  test("generates a complete deployment file with a fresh strong secret", () => {
    const generated = buildDeploymentEnvironment({
      workspaceEmail: "owner@example.com",
      tailscaleLogin: "owner@example.com",
      appOrigin: "https://portfolio.example-tailnet.ts.net",
      backupRoot: "/srv/portfolio-journal-backups",
    }, "/workspace/portfolio-journal");
    expect(generated).toContain("POSTGRES_DB=portfolio_journal\n");
    expect(generated).toContain("TAILSCALE_ALLOWED_LOGIN=owner@example.com\n");
    expect(generated).toMatch(/POSTGRES_PASSWORD=[a-f0-9]{64}\n/);
    expect(generated).not.toContain("replace_with");
  });
});

describe("workspace bootstrap", () => {
  test("normalizes and validates the initial email", () => {
    expect(normalizeWorkspaceEmail(" Owner@Example.com ")).toBe("owner@example.com");
    expect(() => normalizeWorkspaceEmail("not-an-email")).toThrow("WORKSPACE_EMAIL");
  });

  test("creates exactly one disabled-login workspace owner for an empty database", async () => {
    const prisma = { user: { findMany: vi.fn(async () => []), create: vi.fn(async ({ data }) => ({ id: "user-1", ...data })) } };
    await expect(bootstrapWorkspace(prisma, "owner@example.com")).resolves.toMatchObject({ action: "created", user: { email: "owner@example.com" } });
    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ passwordHash: expect.stringMatching(/^disabled_[a-f0-9]{96}$/) }) });
  });

  test("preserves one owner and rejects ambiguous multi-user databases", async () => {
    const existing = { id: "user-1", email: "existing@example.com" };
    const single = { user: { findMany: vi.fn(async () => [existing]), create: vi.fn() } };
    await expect(bootstrapWorkspace(single, "ignored@example.com")).resolves.toEqual({ action: "preserved", user: existing });
    expect(single.user.create).not.toHaveBeenCalled();

    const multiple = { user: { findMany: vi.fn(async () => [existing, { id: "user-2", email: "other@example.com" }]), create: vi.fn() } };
    await expect(bootstrapWorkspace(multiple, "ignored@example.com")).rejects.toThrow("Multiple workspace users");
  });
});
