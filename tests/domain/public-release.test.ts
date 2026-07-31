import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const temporaryDirectories: string[] = [];

function createRepository(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "portfolio-public-release-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, "script"));
  cpSync("script/check-public-release.sh", join(root, "script/check-public-release.sh"));
  chmodSync(join(root, "script/check-public-release.sh"), 0o755);
  for (const [relativePath, content] of Object.entries(files)) {
    writeFileSync(join(root, relativePath), content);
  }
  spawnSync("git", ["init", "--initial-branch=main"], { cwd: root });
  spawnSync("git", ["add", "."], { cwd: root });
  spawnSync("git", ["-c", "user.name=Release Test", "-c", "user.email=release-test@users.noreply.github.com", "commit", "-m", "Initial public release"], { cwd: root });
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("public release gate", () => {
  test("pins CI actions and runtime images to immutable revisions", () => {
    const workflows = readFileSync(".github/workflows/ci.yml", "utf8") + readFileSync(".github/workflows/codeql.yml", "utf8");
    const dockerSources = readFileSync("Dockerfile", "utf8") + readFileSync("compose.yaml", "utf8");
    expect(workflows).not.toMatch(/uses:\s+[^\s]+@v\d+/);
    expect(workflows).toMatch(/actions\/checkout@[a-f0-9]{40}/);
    expect(workflows).toMatch(/github\/codeql-action\/analyze@[a-f0-9]{40}/);
    expect(workflows).toMatch(/actions\/upload-artifact@[a-f0-9]{40}/);
    const externalImageLines = dockerSources.split("\n").filter((line) => /(?:FROM|image:)\s+(?:node|postgres):/.test(line));
    expect(externalImageLines.every((line) => /@sha256:[a-f0-9]{64}/.test(line))).toBe(true);
    expect(dockerSources.match(/@sha256:[a-f0-9]{64}/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test("retains browser diagnostics and retries a failed E2E test once in CI", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const playwright = readFileSync("playwright.config.ts", "utf8");
    expect(playwright).toContain("retries: process.env.CI ? 1 : 0");
    expect(playwright).toContain("timeout: process.env.CI ? 120_000 : 30_000");
    expect(playwright).toContain('trace: "retain-on-failure"');
    expect(playwright).toContain('screenshot: "only-on-failure"');
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("path: test-results");
  });

  test("keeps secret-scan exceptions limited to documented synthetic values", () => {
    const configuration = readFileSync(".gitleaks.toml", "utf8");
    expect(configuration).toContain("useDefault = true");
    expect(configuration).toContain("replace_with_64_hex_characters");
    expect(configuration).toContain("0123456789abcdef0123456789abcdef");
    expect(configuration).not.toContain("paths =");
  });

  test("accepts a one-commit repository without private artifacts", () => {
    const root = createRepository({ "README.md": "# Safe public project\n" });
    const result = spawnSync("bash", ["script/check-public-release.sh", "--history", "--fresh-root"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PUBLIC_RELEASE_CHECK_OK");
  });

  test("rejects tracked environment files without printing their contents", () => {
    const root = createRepository({ ".env.production": "SECRET_VALUE=do-not-print-this\n" });
    const result = spawnSync("bash", ["script/check-public-release.sh"], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(".env.production");
    expect(result.stderr).not.toContain("do-not-print-this");
  });

  test("rejects secrets found only in Git history", () => {
    const root = createRepository({ "README.md": "# Safe public project\n" });
    const fakeToken = "ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890";
    writeFileSync(join(root, "leaked.txt"), `token=${fakeToken}\n`);
    spawnSync("git", ["add", "leaked.txt"], { cwd: root });
    spawnSync("git", ["-c", "user.name=Release Test", "-c", "user.email=release-test@users.noreply.github.com", "commit", "-m", "temporary leak"], { cwd: root });
    rmSync(join(root, "leaked.txt"));
    spawnSync("git", ["add", "-u"], { cwd: root });
    spawnSync("git", ["-c", "user.name=Release Test", "-c", "user.email=release-test@users.noreply.github.com", "commit", "-m", "remove leak"], { cwd: root });

    const result = spawnSync("bash", ["script/check-public-release.sh", "--history"], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Git history contains a token-like secret");
    expect(result.stderr).not.toContain(fakeToken);
  });
});
