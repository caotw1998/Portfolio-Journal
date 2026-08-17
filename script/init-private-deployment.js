/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes } = require("node:crypto");
const { chmodSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { validateDeploymentEnvironment } = require("./deploy-check.js");

function buildDeploymentEnvironment({ workspaceEmail, tailscaleLogin, appOrigin, backupRoot }, workingDirectory = process.cwd()) {
  const environment = {
    POSTGRES_DB: "portfolio_journal",
    POSTGRES_USER: "portfolio",
    POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
    SYNC_WORKER_TOKEN: randomBytes(32).toString("hex"),
    WORKSPACE_EMAIL: workspaceEmail,
    TAILSCALE_ALLOWED_LOGIN: tailscaleLogin,
    APP_ORIGIN: appOrigin,
    APP_PORT: "3000",
    BACKUP_ROOT: backupRoot,
  };
  const errors = validateDeploymentEnvironment(environment, workingDirectory);
  if (errors.length) throw new Error(`Invalid deployment configuration:\n- ${errors.join("\n- ")}`);
  return `${Object.entries(environment).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

function main() {
  const [output = ".env.deploy", workspaceEmail, tailscaleLogin, appOrigin, backupRoot] = process.argv.slice(2);
  if (!workspaceEmail || !tailscaleLogin || !appOrigin || !backupRoot) {
    process.stderr.write("Usage: node script/init-private-deployment.js [output] <workspace-email> <tailscale-login> <app-origin> <backup-root>\n");
    process.exitCode = 1;
    return;
  }
  const outputPath = path.resolve(output);
  const contents = buildDeploymentEnvironment({ workspaceEmail, tailscaleLogin, appOrigin, backupRoot });
  try {
    writeFileSync(outputPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    chmodSync(outputPath, 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Refusing to overwrite existing deployment configuration: ${output}`);
    throw error;
  }
  process.stdout.write(`PRIVATE_DEPLOYMENT_ENV_CREATED ${output}\n`);
}

if (require.main === module) main();

module.exports = { buildDeploymentEnvironment };
