import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

let testRoot: string;
let fakeBin: string;
let fakeLog: string;

function writeExecutable(name: string, content: string) {
  const target = join(fakeBin, name);
  writeFileSync(target, content);
  chmodSync(target, 0o755);
}

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "portfolio-deployment-test-"));
  fakeBin = join(testRoot, "bin");
  fakeLog = join(testRoot, "docker.log");
  mkdirSync(fakeBin);
  writeExecutable("docker", `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  "compose ps --status running --services")
    if [[ "\${FAKE_APP_RUNNING:-}" == "1" ]]; then printf 'app\\n'; fi
    ;;
  *'printf %s "$POSTGRES_DB"'*) printf 'portfolio_journal' ;;
  *pg_dump*) printf 'portable-fake-dump\\n' ;;
  *pg_restore*) cat >/dev/null ;;
esac
`);
});

afterEach(() => rmSync(testRoot, { recursive: true, force: true }));

function environment(extra: Record<string, string> = {}) {
  return { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, FAKE_DOCKER_LOG: fakeLog, ...extra };
}

describe("Docker PostgreSQL operations", () => {
  test("writes a portable dump and relative SHA-256 manifest", () => {
    const backupRoot = join(testRoot, "backups");
    const result = spawnSync("bash", ["script/docker-postgres-backup.sh", backupRoot], { cwd: process.cwd(), env: environment(), encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const dumpName = readdirSync(backupRoot).find((name) => name.endsWith(".dump") && name !== "latest.dump");
    expect(dumpName).toBeTruthy();
    expect(readFileSync(join(backupRoot, dumpName!), "utf8")).toBe("portable-fake-dump\n");
    expect(readFileSync(join(backupRoot, `${dumpName}.sha256`), "utf8")).toMatch(new RegExp(`^[a-f0-9]{64}  ${dumpName}\\n$`));
  });

  test("refuses to restore while the application is running", () => {
    const dump = join(testRoot, "source.dump");
    const backupRoot = join(testRoot, "backups");
    writeFileSync(dump, "portable-fake-dump\n");
    const result = spawnSync("bash", ["script/docker-postgres-restore.sh", dump], {
      cwd: process.cwd(),
      env: environment({ BACKUP_ROOT: backupRoot, RESTORE_CONFIRM: "portfolio_journal", FAKE_APP_RUNNING: "1" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("app service is running");
  });

  test("backs up, restores and runs migrations after explicit confirmation", () => {
    const dump = join(testRoot, "source.dump");
    const backupRoot = join(testRoot, "backups");
    writeFileSync(dump, "portable-fake-dump\n");
    const result = spawnSync("bash", ["script/docker-postgres-restore.sh", dump], {
      cwd: process.cwd(),
      env: environment({ BACKUP_ROOT: backupRoot, RESTORE_CONFIRM: "portfolio_journal" }),
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("POSTGRES_RESTORE_OK portfolio_journal");
    const dockerCalls = readFileSync(fakeLog, "utf8");
    expect(dockerCalls).toContain("pg_restore");
    expect(dockerCalls).toContain("compose run --rm migrate");
  });

  test("verifies private runtime access and opt-in restart persistence", () => {
    writeExecutable("docker", `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "compose config --quiet") ;;
  "compose ps --status running --services") printf 'db\\napp\\nworker\\n' ;;
  "compose ps -q db") printf 'db-container-id\\n' ;;
  "compose ps -q worker") printf 'worker-container-id\\n' ;;
  "compose port app 3000") printf '127.0.0.1:3000\\n' ;;
  *HostConfig.PortBindings*) printf '{}\\n' ;;
  "compose exec -T app id -u") printf '10001\\n' ;;
  *private-deployment-write-test*) exit 1 ;;
  *'printf %s "$APP_ORIGIN"'*) printf 'https://portfolio.example-tailnet.ts.net' ;;
  *'printf %s "$TAILSCALE_ALLOWED_LOGIN"'*) printf 'owner@example.com' ;;
  *pg_isready*) exit 0 ;;
  *json_build_array*) printf '[1,2,3]\\n' ;;
  "compose restart db app") ;;
  *) printf 'Unexpected docker call: %s\\n' "$*" >&2; exit 1 ;;
esac
`);
    writeExecutable("tailscale.exe", `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == "serve status" ]]; then printf 'Available within your tailnet\\n'; else exit 1; fi
`);
    writeExecutable("curl", `#!/usr/bin/env bash
set -euo pipefail
arguments="$*"
if [[ " $arguments " == *" --head "* ]]; then
  printf 'content-security-policy: default-src '\''self'\''\\nstrict-transport-security: max-age=31536000\\nx-content-type-options: nosniff\\nx-frame-options: DENY\\npermissions-policy: camera=()\\n'
elif [[ "$arguments" == *"https://portfolio.example-tailnet.ts.net"* ]]; then exit 28
elif [[ "$arguments" == *"/api/health"* ]]; then printf '200'
elif [[ "$arguments" == *"denied@example.invalid"* ]]; then printf '403'
elif [[ "$arguments" == *"--request POST"* ]]; then printf '403'
elif [[ "$arguments" == *"owner@example.com"* ]]; then printf '200'
else printf '401'
fi
`);
    writeExecutable("curl.exe", `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"https://portfolio.example-tailnet.ts.net"* ]]; then printf '200'; else exit 1; fi
`);

    const result = spawnSync("bash", ["script/verify-private-deployment.sh"], {
      cwd: process.cwd(),
      env: environment({ VERIFY_RESTART: "1" }),
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("NETWORK_BINDING_OK");
    expect(result.stdout).toContain("TAILSCALE_PRIVATE_ACCESS_OK");
    expect(result.stdout).toContain("RESTART_PERSISTENCE_OK counts=[1,2,3]");
    expect(result.stdout).toContain("PRIVATE_DEPLOYMENT_VERIFIED");
  });
});
