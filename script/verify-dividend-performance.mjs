import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const browserErrors = [];
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));

await page.goto(`${baseUrl}/research`);
await page.waitForLoadState("networkidle");
const fundLink = page.locator('a[href^="/funds/"]').filter({ hasText: "华商优势行业混合A" }).first();
assert.equal(await fundLink.isVisible(), true, "研究库中未找到华商优势行业混合A");
const fundHref = await fundLink.getAttribute("href");
assert.ok(fundHref);
await page.goto(`${baseUrl}${fundHref}`);
await page.waitForLoadState("networkidle");

const oneYearMetric = page.getByText("近一年", { exact: true }).locator("..");
assert.equal(await oneYearMetric.getByText("145.33%", { exact: true }).isVisible(), true);
assert.equal(await page.getByText("3065 个观测点 · 20 次分红", { exact: true }).isVisible(), true);
assert.equal(await page.getByTestId("dividend-legend").isVisible(), true);
assert.match(await page.getByTestId("dividend-legend").innerText(), /金色菱形：基金分红/);

const chart = page.locator("canvas").first();
await chart.waitFor({ state: "visible" });
await page.waitForTimeout(800);
const dividendMarkerPosition = await chart.evaluate((element) => {
  if (!(element instanceof HTMLCanvasElement)) return null;
  const context = element.getContext("2d");
  if (!context) return null;
  const pixels = context.getImageData(0, 0, element.width, element.height).data;
  const matches = [];
  for (let y = 0; y < element.height; y += 1) {
    for (let x = 0; x < element.width; x += 1) {
      const offset = (y * element.width + x) * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      if (red >= 155 && red <= 205 && green >= 85 && green <= 145 && blue <= 65) matches.push({ x, y });
    }
  }
  if (!matches.length) return null;
  const groups = [];
  for (const point of matches) {
    let group = groups.find((item) => Math.abs(item.centerX - point.x) <= 14);
    if (!group) {
      group = { points: [], centerX: point.x };
      groups.push(group);
    }
    group.points.push(point);
    group.centerX = group.points.reduce((sum, item) => sum + item.x, 0) / group.points.length;
  }
  const group = groups.sort((left, right) => right.points.length - left.points.length)[0];
  if (!group || group.points.length < 8) return null;
  const x = group.points.reduce((sum, point) => sum + point.x, 0) / group.points.length;
  const y = group.points.reduce((sum, point) => sum + point.y, 0) / group.points.length;
  return { x: x * element.clientWidth / element.width, y: y * element.clientHeight / element.height };
});
assert.ok(dividendMarkerPosition, "未在图表中找到分红菱形标记");
await chart.click({ position: dividendMarkerPosition });
await page.getByTestId("dividend-card").waitFor({ state: "visible" });
assert.match(await page.getByTestId("dividend-card").innerText(), /每份分红/);
assert.match(await page.getByTestId("dividend-card").innerText(), /分红再投资后的总回报/);

await page.screenshot({ path: "/tmp/dividend-performance-desktop.png", fullPage: true });
await page.mouse.move(0, 0);
await page.waitForTimeout(100);
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.waitForLoadState("networkidle");
assert.equal(await page.getByTestId("dividend-legend").isVisible(), true);
await page.screenshot({ path: "/tmp/dividend-performance-mobile.png", fullPage: true });
assert.deepEqual(browserErrors, []);
await browser.close();
process.stdout.write("Dividend-adjusted performance and chart markers verified.\n");
