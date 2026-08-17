/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
const SAFE_DATABASE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

function validateDeploymentEnvironment(environment, workingDirectory = process.cwd()) {
  const errors = [];
  const required = ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "SYNC_WORKER_TOKEN", "WORKSPACE_EMAIL", "TAILSCALE_ALLOWED_LOGIN", "APP_ORIGIN", "BACKUP_ROOT"];
  for (const key of required) {
    if (!environment[key]?.trim()) errors.push(`${key} is required.`);
  }

  if (environment.POSTGRES_PASSWORD && !SAFE_SECRET_PATTERN.test(environment.POSTGRES_PASSWORD)) {
    errors.push("POSTGRES_PASSWORD must be at least 32 URL-safe characters (letters, numbers, _ or -). Use: openssl rand -hex 32");
  }
  if (environment.SYNC_WORKER_TOKEN && !SAFE_SECRET_PATTERN.test(environment.SYNC_WORKER_TOKEN)) {
    errors.push("SYNC_WORKER_TOKEN must be at least 32 URL-safe characters (letters, numbers, _ or -). Use: openssl rand -hex 32");
  }
  if (environment.SYNC_WORKER_TOKEN && environment.SYNC_WORKER_TOKEN === environment.POSTGRES_PASSWORD) {
    errors.push("SYNC_WORKER_TOKEN must differ from POSTGRES_PASSWORD.");
  }
  for (const key of ["POSTGRES_DB", "POSTGRES_USER"]) {
    if (environment[key] && !SAFE_DATABASE_IDENTIFIER_PATTERN.test(environment[key])) {
      errors.push(`${key} must use only letters, numbers and underscores, and cannot start with a number.`);
    }
  }
  for (const key of ["WORKSPACE_EMAIL", "TAILSCALE_ALLOWED_LOGIN"]) {
    if (environment[key] && !EMAIL_PATTERN.test(environment[key])) errors.push(`${key} must be a valid email address.`);
  }

  if (environment.APP_ORIGIN) {
    try {
      const origin = new URL(environment.APP_ORIGIN);
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
        errors.push("APP_ORIGIN must be an HTTPS origin without credentials, path, query or fragment.");
      }
    } catch {
      errors.push("APP_ORIGIN must be a valid URL.");
    }
  }

  if (environment.APP_PORT && (!/^\d+$/.test(environment.APP_PORT) || Number(environment.APP_PORT) < 1 || Number(environment.APP_PORT) > 65535)) {
    errors.push("APP_PORT must be an integer between 1 and 65535.");
  }

  if (environment.BACKUP_ROOT) {
    const backupRoot = path.resolve(environment.BACKUP_ROOT);
    const repositoryRoot = `${path.resolve(workingDirectory)}${path.sep}`;
    if (!path.isAbsolute(environment.BACKUP_ROOT)) errors.push("BACKUP_ROOT must be an absolute path outside the repository.");
    if (`${backupRoot}${path.sep}`.startsWith(repositoryRoot)) errors.push("BACKUP_ROOT must be outside the repository.");
  }
  return errors;
}

function main() {
  const errors = validateDeploymentEnvironment(process.env);
  if (errors.length) {
    process.stderr.write(`Deployment configuration is invalid:\n- ${errors.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("DEPLOYMENT_CONFIG_OK\n");
}

if (require.main === module) main();

module.exports = { validateDeploymentEnvironment };
