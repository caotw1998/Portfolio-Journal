import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const rangePattern = /(?<from>\d{4}-\d{2}-\d{2}) 至 (?<to>\d{4}-\d{2}-\d{2}) · (?<count>\d+) 个观测点/;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const browserErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    browserErrors.push(message.text());
  }
});
page.on("pageerror", (error) => browserErrors.push(error.message));

let homeResponse = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    homeResponse = await page.goto(`${baseUrl}/`);
    if (homeResponse) {
      break;
    }
  } catch {
    await page.waitForTimeout(500);
  }
}

assert.notEqual(homeResponse, null, "The local Next.js server did not become ready.");
await page.waitForLoadState("networkidle");
assert.equal(page.url().endsWith("/research"), true);
assert.equal(await page.getByText("本地研究工作区").isVisible(), true);
assert.equal(await page.getByRole("button", { name: "退出登录" }).count(), 0);

const apiResponse = await page.request.get(`${baseUrl}/api/funds`);
assert.equal(apiResponse.status(), 200);

const fundLinks = page.locator('a[href^="/funds/"]');
assert.equal((await fundLinks.count()) > 0, true);
const fundHref = await fundLinks.first().getAttribute("href");
assert.notEqual(fundHref, null);
await page.goto(`${baseUrl}${fundHref}`);
await page.waitForLoadState("networkidle");
assert.equal(
  await page.getByRole("heading", { name: "净值档案" }).isVisible(),
  true,
  `${page.url()}\n${await page.locator("body").innerText()}`,
);

const rangeStatus = page.locator('p[aria-live="polite"]');
const initialStatus = await rangeStatus.innerText();
const rangeMatch = rangePattern.exec(initialStatus);
assert.notEqual(rangeMatch, null, initialStatus);

const oneYearButton = page.getByRole("button", { name: "1年", exact: true }).first();
await oneYearButton.click();
assert.equal((await oneYearButton.getAttribute("class"))?.includes("bg-accent"), true);

await page.getByRole("button", { name: "自定义", exact: true }).click();
await page.getByLabel("开始日期").fill(rangeMatch.groups.from);
await page.getByLabel("结束日期").fill(rangeMatch.groups.from);
await page.getByRole("button", { name: "应用", exact: true }).click();
await page.waitForTimeout(100);
const customStatus = await rangeStatus.innerText();
assert.equal(
  customStatus.startsWith(`${rangeMatch.groups.from} 至 ${rangeMatch.groups.from} · `),
  true,
  customStatus,
);

await page.screenshot({ path: "/tmp/fund-chart-range-verified.png", fullPage: true });
assert.deepEqual(browserErrors, []);

const loginResponse = await page.goto(`${baseUrl}/login`);
await page.waitForLoadState("networkidle");
assert.equal(loginResponse?.status(), 404);

await browser.close();
process.stdout.write("Workspace login removal and fund chart ranges verified.\n");
