import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(`${baseUrl}/research`);
await page.waitForLoadState("networkidle");
assert.equal(await page.getByRole("heading", { name: "我的研究库" }).isVisible(), true);
assert.equal(await page.locator("span").filter({ hasText: /^最大回撤$/ }).first().isVisible(), true);
const listResponse = await page.request.get(`${baseUrl}/api/funds`);
assert.equal(listResponse.status(), 200);
assert.ok((await listResponse.body()).byteLength < 100_000, "研究库 API 超过 100 KB");

const fundHref = await page.locator('a[href^="/funds/"]').first().getAttribute("href");
assert.ok(fundHref);
await page.goto(`${baseUrl}${fundHref}`);
await page.waitForLoadState("networkidle");
assert.equal(await page.getByRole("heading", { name: "业绩与风险" }).isVisible(), true);
assert.equal(await page.getByRole("heading", { name: "规模与资金结构" }).isVisible(), true);
assert.ok(await page.locator("details").count() >= 5);
const detailResponse = await page.request.get(`${baseUrl}/api${fundHref.replace("/funds/", "/funds/")}`);
assert.equal(detailResponse.status(), 200);
assert.ok((await detailResponse.body()).byteLength < 400_000, "基金概览 API 超过 400 KB");
assert.equal((await detailResponse.text()).includes("rawJson"), false);

await page.goto(`${baseUrl}/model-portfolios`);
await page.waitForLoadState("networkidle");
assert.equal(await page.getByRole("heading", { name: "目标权重" }).isVisible(), true);
assert.equal(await page.getByRole("button", { name: "保存组合" }).isVisible(), true);
await page.screenshot({ path: "/tmp/fund-research-v2-desktop.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}/research`);
await page.waitForLoadState("networkidle");
assert.equal(await page.getByRole("heading", { name: "我的研究库" }).isVisible(), true);
await page.screenshot({ path: "/tmp/fund-research-v2-mobile.png", fullPage: true });
assert.deepEqual(errors, []);
await browser.close();
process.stdout.write("Fund research V2 desktop/mobile UI verified.\n");
