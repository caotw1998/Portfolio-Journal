import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: process.env.CI ? 60_000 : 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      "tailscale-user-login": "e2e@example.com",
    },
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  webServer: {
    command: "bash script/run-e2e-web.sh",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
