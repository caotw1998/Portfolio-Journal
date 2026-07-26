import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test("search, follow, inspect and compare a fund with an index", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required.");
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const email = `e2e-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: "E2E Researcher",
      passwordHash: "unused-single-workspace-credential",
    },
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/research/);
  await expect(page.getByText("本地研究工作区")).toBeVisible();
  await page.route("**/api/funds/search?q=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ code: "110022", name: "易方达消费行业股票", market: "CN_FUND", type: "股票型", source: "eastmoney" }] }) }));
  await page.route("**/api/funds", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const fund = await prisma.fund.create({
      data: {
        code: "110022", name: "易方达消费行业股票", fullName: "易方达消费行业股票型证券投资基金", market: "CN_FUND", type: "股票型", latestSyncAt: new Date(),
        company: "易方达基金", custodian: "农业银行", issueDate: new Date("2010-07-26T00:00:00Z"), establishedDate: new Date("2010-08-20T00:00:00Z"),
        managementFeeRate: 0.012, custodianFeeRate: 0.002, salesServiceFeeRate: 0, investmentObjective: "追求超越业绩比较基准的投资回报。", riskReturnCharacteristics: "预期风险与收益较高。",
        followers: { create: { userId: user.id } },
        scaleSnapshots: { create: [
          { reportDate: new Date("2026-06-30T00:00:00Z"), netAssets: 12.5, shares: 8.2, source: "eastmoney" },
          { reportDate: new Date("2025-12-31T00:00:00Z"), netAssets: 10.25, shares: 7.8, source: "eastmoney" },
        ] },
        flowSnapshots: { create: [
          { reportDate: new Date("2026-06-30T00:00:00Z"), subscriptions: 2.5, redemptions: 1.25, totalShares: 8.2, source: "eastmoney" },
          { reportDate: new Date("2025-12-31T00:00:00Z"), subscriptions: 1.5, redemptions: 1, totalShares: 7.8, source: "eastmoney" },
        ] },
        holderSnapshots: { create: [
          { reportDate: new Date("2025-12-31T00:00:00Z"), institutionPercent: 35.63, individualPercent: 64.37, internalPercent: 0.02, source: "eastmoney" },
          { reportDate: new Date("2025-06-30T00:00:00Z"), institutionPercent: 40.4, individualPercent: 59.6, internalPercent: 0.03, source: "eastmoney" },
        ] },
        navSnapshots: { create: [
          { valuationDate: new Date("2024-01-31T00:00:00Z"), unitNav: 2.8, accumulatedNav: 3.7, source: "eastmoney" },
          { valuationDate: new Date("2025-06-01T00:00:00Z"), unitNav: 2.5, accumulatedNav: 3.0, source: "eastmoney" },
          { valuationDate: new Date("2025-08-01T00:00:00Z"), unitNav: 3.1, accumulatedNav: 4.2, source: "eastmoney" },
          { valuationDate: new Date("2026-07-01T00:00:00Z"), unitNav: 3.4, accumulatedNav: 4.7, source: "eastmoney" },
        ] },
        dividendEvents: { create: { exDate: new Date("2026-07-01T00:00:00Z"), amount: 0.2, source: "eastmoney" } },
        managerTenures: { create: [
          { managerName: "萧楠", startDate: new Date("2025-04-12T00:00:00Z"), tenureReturn: 0.19, source: "eastmoney" },
          { managerName: "王元春", startDate: new Date("2021-01-16T00:00:00Z"), endDate: new Date("2025-04-11T00:00:00Z"), tenureReturn: -0.332, source: "eastmoney" },
        ] },
        portfolioReports: { create: [
          { reportDate: new Date("2025-12-31T00:00:00Z"), stockPercent: 88, bondPercent: 2, cashPercent: 8, otherPercent: 2, source: "eastmoney", holdings: { create: [
            { kind: "stock", rank: 1, code: "600519", name: "贵州茅台", weight: 8.5, quantity: 109.77, marketValue: 154718.78 },
            { kind: "bond", rank: 1, code: "110059", name: "浦发转债", weight: 1.2, marketValue: 2000 },
          ] } },
          { reportDate: new Date("2025-06-30T00:00:00Z"), stockPercent: 90, bondPercent: 1, cashPercent: 7, otherPercent: 2, source: "eastmoney", holdings: { create: [
            { kind: "stock", rank: 1, code: "000333", name: "美的集团", weight: 9.32, quantity: 2174.69, marketValue: 157012.33 },
          ] } },
        ] },
      },
    });
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { id: fund.id } }) });
  });
  await page.getByLabel("基金代码或名称").fill("110022");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("易方达消费行业股票").first()).toBeVisible();
  await page.getByRole("button", { name: "加入" }).click();
  await expect(page.getByRole("link", { name: "易方达消费行业股票" })).toBeVisible();
  await expect(page.getByText("12.5 亿元")).toBeVisible();
  await expect(page.getByText("1.40% / 年")).toBeVisible();
  await expect(page.getByText("日涨跌", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 年", { exact: true })).toHaveCount(0);
  await expect(page.getByText("3 年", { exact: true })).toHaveCount(0);
  await expect(page.getByText("经理", { exact: true })).toHaveCount(0);

  const discoverSection = page.getByRole("heading", { name: "搜索公开基金目录" }).locator("xpath=ancestor::section[1]");
  const librarySection = page.getByRole("heading", { name: "我的研究库" }).locator("xpath=ancestor::section[1]");
  const [discoverBox, libraryBox] = await Promise.all([discoverSection.boundingBox(), librarySection.boundingBox()]);
  expect(discoverBox).not.toBeNull();
  expect(libraryBox).not.toBeNull();
  expect(Math.abs(discoverBox!.x - libraryBox!.x)).toBeLessThan(2);
  expect(Math.abs(discoverBox!.width - libraryBox!.width)).toBeLessThan(2);

  const categorySummary = page.locator("summary").filter({ hasText: "分类" }).first();
  await categorySummary.click();
  await page.getByLabel("A股").check();
  await expect(categorySummary).toContainText("A股");
  await page.getByLabel("海外资产").check();
  await expect(categorySummary).toContainText("A股 / 海外资产");
  await page.getByRole("button", { name: /^A股 1$/ }).click();
  await expect(page.getByRole("link", { name: "易方达消费行业股票" })).toBeVisible();
  await page.getByRole("button", { name: /^港股 0$/ }).click();
  await expect(page.getByText("这个分类还没有基金")).toBeVisible();
  await page.getByRole("button", { name: /^全部 1$/ }).click();
  await expect(page.getByRole("button", { name: "全部刷新" })).toBeEnabled();

  await page.getByRole("button", { name: "管理分类" }).click();
  await page.getByLabel("新分类名称").fill("核心观察");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByRole("button", { name: /^核心观察 0$/ })).toBeVisible();
  const categoryNameInput = page.getByLabel("核心观察分类名称");
  await categoryNameInput.fill("长期跟踪");
  await categoryNameInput.locator("xpath=..").getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("button", { name: /^长期跟踪 0$/ })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("长期跟踪分类名称").locator("xpath=..").getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("button", { name: /^长期跟踪/ })).toHaveCount(0);

  const benchmark = await prisma.benchmarkInstrument.create({ data: { userId: user.id, code: "000300", market: "CN", name: "沪深300", provider: "public_market", priceSnapshots: { create: [
    { date: new Date("2025-08-01T00:00:00Z"), closeValue: 3500, source: "public_market" },
    { date: new Date("2026-07-01T00:00:00Z"), closeValue: 3900, source: "public_market" },
  ] } } });
  expect(benchmark.id).toBeTruthy();
  await page.route("**/api/benchmarks/search?q=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ code: "SPX", name: "标普500", market: "GLOBAL", source: "eastmoney", sourceSymbol: "100.SPX" }] }) }));
  await page.route("**/api/benchmarks/*/sync", async (route) => {
    const benchmarkId = new URL(route.request().url()).pathname.split("/").at(-2);
    if (!benchmarkId) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "missing id" }) });
    await prisma.benchmarkInstrument.update({ where: { id: benchmarkId }, data: { status: "active", lastSyncAt: new Date(), lastSyncError: null, priceSnapshots: { create: [
      { date: new Date("2026-07-23T00:00:00Z"), closeValue: 6380.1, source: "public_market" },
      { date: new Date("2026-07-24T00:00:00Z"), closeValue: 6412.45, source: "public_market" },
    ] } } });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: benchmarkId } }) });
  });
  await page.goto("/benchmarks");
  await page.getByLabel("指数代码或名称").fill("标普500");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("SPX.GLOBAL · eastmoney")).toBeVisible();
  await page.getByRole("button", { name: "加入并同步" }).click();
  await expect(page.getByText("指数已加入并完成首轮同步。")).toBeVisible();
  const spxCard = page.getByRole("article").filter({ hasText: "SPX.GLOBAL" });
  await expect(spxCard.getByText("标普500", { exact: true })).toBeVisible();
  await expect(page.getByText("SPX.GLOBAL")).toBeVisible();
  await page.getByLabel("指数代码或名称").fill("SPX");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByRole("button", { name: "已录入" })).toBeDisabled();
  await expect(page.getByText("搜索不到？手工录入")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/benchmark-search-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/benchmark-search-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "设置" }).click();
  await page.getByLabel("单曲线默认颜色").fill("#123456");
  await page.getByLabel("多曲线颜色 1").fill("#112233");
  await page.getByLabel("多曲线颜色 2").fill("#445566");
  await page.getByRole("button", { name: "保存图表设置" }).click();
  await expect(page.getByText("图表颜色设置已更新。")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("单曲线默认颜色")).toHaveValue("#123456");
  await expect(page.getByLabel("多曲线颜色 1")).toHaveValue("#112233");
  await page.getByRole("link", { name: "研究库" }).click();
  await page.getByRole("link", { name: "易方达消费行业股票" }).click();
  await expect(page.getByRole("heading", { name: "业绩与风险" })).toBeVisible();
  const sectionNavigation = page.getByRole("navigation", { name: "基金详情页内导航" });
  const performanceSectionLink = sectionNavigation.getByRole("link", { name: "业绩风险" });
  const capitalSectionLink = sectionNavigation.getByRole("link", { name: "规模资金" });
  const portfolioSectionLink = sectionNavigation.getByRole("link", { name: "持仓变化" });
  const qualitySectionLink = sectionNavigation.getByRole("link", { name: "数据质量" });
  await expect(sectionNavigation).toHaveCSS("position", "sticky");
  await expect(performanceSectionLink).toHaveAttribute("aria-current", "location");
  const desktopNavigationLinkBoxes = await Promise.all([
    performanceSectionLink.boundingBox(),
    capitalSectionLink.boundingBox(),
  ]);
  expect(desktopNavigationLinkBoxes[0]).not.toBeNull();
  expect(desktopNavigationLinkBoxes[1]).not.toBeNull();
  expect(desktopNavigationLinkBoxes[1]!.y).toBeGreaterThan(desktopNavigationLinkBoxes[0]!.y + 20);
  await capitalSectionLink.click();
  await expect(page).toHaveURL(/#capital$/);
  await expect(capitalSectionLink).toHaveAttribute("aria-current", "location");
  await portfolioSectionLink.click();
  await expect(page).toHaveURL(/#portfolio$/);
  await expect(portfolioSectionLink).toHaveAttribute("aria-current", "location");
  await qualitySectionLink.click();
  await expect(page).toHaveURL(/#quality$/);
  await expect(qualitySectionLink).toHaveAttribute("aria-current", "location");
  const stickyNavigationBox = await sectionNavigation.boundingBox();
  expect(stickyNavigationBox).not.toBeNull();
  expect(stickyNavigationBox!.y).toBeLessThanOrEqual(25);
  await page.reload();
  await expect(page).toHaveURL(/#quality$/);
  await expect(qualitySectionLink).toHaveAttribute("aria-current", "location");
  await performanceSectionLink.click();
  await expect(page).toHaveURL(/#performance$/);
  await expect(performanceSectionLink).toHaveAttribute("aria-current", "location");
  const detailHeadings = await page.locator("h2").allTextContents();
  expect(detailHeadings.indexOf("规模与资金结构")).toBe(detailHeadings.indexOf("业绩与风险") + 1);
  expect(detailHeadings.indexOf("公开持仓")).toBe(detailHeadings.indexOf("规模与资金结构") + 1);
  await expect(page.getByLabel("规模与资金结构报告期").locator("option")).toHaveText(["2026-06-30", "2025-12-31", "2025-06-30"]);
  await expect(page.getByText("持有人结构最近披露期 2025-12-31")).toBeVisible();
  await expect(page.getByText("64.37%")).toBeVisible();
  await page.getByLabel("规模与资金结构报告期").selectOption("2025-12-31");
  await expect(page.getByText("64.37%")).toBeVisible();
  await expect(page.getByText("散户持有比例（个人投资者）")).toBeVisible();
  await expect(page.getByText("10.25 亿元")).toBeVisible();
  await expect(page.getByText("2024-01-31 至 2026-07-01 · 4 个观测点")).toBeVisible();
  const fundCurveLabel = page.getByRole("button", { name: "基金净值" });
  await expect(fundCurveLabel.locator("span")).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await fundCurveLabel.click();
  await expect(fundCurveLabel).toHaveAttribute("aria-pressed", "true");
  await fundCurveLabel.click();
  await expect(fundCurveLabel).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("2026-07-01 相对起点")).toBeVisible();
  await expect(page.getByText("+28.57%")).toBeVisible();
  await expect(page.getByText("基金年化")).toBeVisible();
  const managerMarkerToggle = page.getByTestId("manager-change-legend");
  const dividendMarkerToggle = page.getByTestId("dividend-legend");
  await expect(managerMarkerToggle).toHaveAttribute("aria-pressed", "true");
  await expect(dividendMarkerToggle).toHaveAttribute("aria-pressed", "false");
  await dividendMarkerToggle.click();
  await expect(dividendMarkerToggle).toHaveAttribute("aria-pressed", "true");
  await dividendMarkerToggle.click();
  await expect(dividendMarkerToggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "回撤曲线" }).click();
  await expect(page.getByRole("button", { name: "回撤曲线" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "业绩曲线" }).click();
  await expect(page.getByText(/最大回撤 -10.71%/)).toBeVisible();
  await expect(page.getByTestId("max-drawdown-segment-legend")).toBeVisible();
  const navChart = page.locator("canvas").first();
  const navChartBox = await navChart.boundingBox();
  expect(navChartBox).not.toBeNull();
  const managerTooltip = page.getByText(/经理更换 2025-04-12/);
  await page.waitForTimeout(800);
  const managerMarkerPosition = await navChart.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) return null;
    const context = element.getContext("2d");
    if (!context) return null;
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let minX = element.width;
    let maxX = -1;
    let minY = element.height;
    let maxY = -1;
    for (let y = 0; y < element.height; y += 1) {
      for (let x = 0; x < element.width; x += 1) {
        const offset = (y * element.width + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        if (red >= 150 && red <= 205 && green <= 70 && blue <= 65) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < 0 || maxY < 0) return null;
    return {
      x: ((minX + maxX) / 2) * element.clientWidth / element.width,
      y: ((minY + maxY) / 2) * element.clientHeight / element.height,
    };
  });
  expect(managerMarkerPosition).not.toBeNull();
  await navChart.hover({ position: managerMarkerPosition! });
  await expect(page.getByText(/相对起点/).last()).toBeVisible();
  await expect(managerTooltip).toBeVisible();
  await navChart.click({ position: managerMarkerPosition! });
  await expect(page.getByTestId("manager-change-card")).toContainText("萧楠");
  await expect(page.getByTestId("manager-change-card")).toContainText("2025-04-12");
  await page.getByRole("heading", { name: "基金档案" }).click();
  await expect(page.getByTestId("manager-change-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "基金档案" })).toBeVisible();
  await expect(page.getByText("易方达消费行业股票型证券投资基金")).toBeVisible();
  await expect(page.getByRole("heading", { name: "基金经理" })).toBeVisible();
  await expect(page.getByText("王元春")).toBeVisible();
  await expect(page.getByRole("heading", { name: "公开持仓" })).toBeVisible();
  await expect(page.getByText("600519")).toBeVisible();
  await page.getByLabel("持仓报告期").selectOption({ label: "2025-06-30" });
  await expect(page).toHaveURL(/report=.*#portfolio$/);
  await expect(page.getByText("000333")).toBeVisible();
  await page.getByRole("button", { name: "长期区间：3年" }).click();
  await expect(page.getByRole("menuitem", { name: "5年" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "10年" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "现任经理以来 · 2025-04-12" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "2019牛市 · 2019-01-04" })).toBeVisible();
  await page.getByRole("menuitem", { name: "现任经理以来 · 2025-04-12" }).click();
  await expect(page.getByRole("button", { name: "长期区间：现任经理以来" })).toBeVisible();
  await expect(page.getByText("2025-06-01 至 2026-07-01 · 3 个观测点")).toBeVisible();
  await page.getByRole("button", { name: "长期区间：现任经理以来" }).click();
  await page.getByRole("menuitem", { name: "5年" }).click();
  await expect(page.getByRole("button", { name: "长期区间：5年" })).toBeVisible();
  await page.getByRole("button", { name: "1年", exact: true }).first().click();
  await expect(page.getByText("2025-08-01 至 2026-07-01 · 2 个观测点")).toBeVisible();
  await expect(page.getByText("+16.13%")).toBeVisible();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await page.getByLabel("开始日期").fill("2024-01-01");
  await page.getByLabel("结束日期").fill("2024-12-31");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await expect(page.getByText("2024-01-31 至 2024-01-31 · 1 个观测点")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "公开持仓" })).toBeVisible();
  const mobileNavigationLinkBoxes = await Promise.all([
    performanceSectionLink.boundingBox(),
    capitalSectionLink.boundingBox(),
  ]);
  expect(mobileNavigationLinkBoxes[0]).not.toBeNull();
  expect(mobileNavigationLinkBoxes[1]).not.toBeNull();
  expect(Math.abs(mobileNavigationLinkBoxes[1]!.y - mobileNavigationLinkBoxes[0]!.y)).toBeLessThan(2);
  await qualitySectionLink.click();
  await expect(page).toHaveURL(/#quality$/);
  await expect(qualitySectionLink).toHaveAttribute("aria-current", "location");
  const mobileStickyNavigationBox = await sectionNavigation.boundingBox();
  const qualitySectionTop = await page.locator("#quality").evaluate((element) => element.getBoundingClientRect().top);
  expect(mobileStickyNavigationBox).not.toBeNull();
  expect(mobileStickyNavigationBox!.y).toBeLessThanOrEqual(1);
  expect(qualitySectionTop).toBeGreaterThanOrEqual(mobileStickyNavigationBox!.height);
  await page.screenshot({ path: "/tmp/fund-detail-sticky-nav-mobile.png" });
  await page.screenshot({ path: "/tmp/fund-detail-data-performance-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "对比指数" })).toBeVisible();
  await page.getByRole("button", { name: "对比指数" }).click();
  await page.getByRole("menuitem", { name: "沪深300 · 000300" }).click();
  await expect(page.getByRole("button", { name: "对比：沪深300" })).toBeVisible();
  await expect(page.getByText("基金收益")).toBeVisible();
  await expect(page.getByText("指数收益")).toBeVisible();
  await expect(page.getByText("基金年化")).toBeVisible();
  await expect(page.getByText("指数年化")).toBeVisible();
  await expect(page.getByText("超额收益")).toBeVisible();
  const benchmarkCurveLabel = page.getByRole("button", { name: "沪深300", exact: true });
  await expect(benchmarkCurveLabel.locator("span")).toHaveCSS("background-color", "rgb(68, 85, 102)");
  await benchmarkCurveLabel.click();
  await expect(benchmarkCurveLabel).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "对比：沪深300" }).click();
  await page.getByRole("menuitem", { name: "无指数对比" }).click();
  await expect(page.getByRole("button", { name: "对比指数" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "与录入指数对比" })).toHaveCount(0);
  await qualitySectionLink.click();
  await expect(qualitySectionLink).toHaveAttribute("aria-current", "location");
  await page.screenshot({ path: "/tmp/fund-detail-sticky-nav-desktop.png" });
  await page.screenshot({ path: "/tmp/fund-detail-data-performance-desktop.png", fullPage: true });
  const emptyPortfolioFund = await prisma.fund.create({ data: {
    code: "000001",
    name: "空持仓测试基金",
    market: "CN_FUND",
    type: "混合型",
    followers: { create: { userId: user.id } },
  } });
  await page.goto(`/funds/${emptyPortfolioFund.id}`);
  await expect(page.getByText("公开来源暂未披露持仓报告。")).toBeVisible();
  await page.getByRole("navigation", { name: "基金详情页内导航" }).getByRole("link", { name: "持仓变化" }).click();
  await expect(page).toHaveURL(/#portfolio$/);
  await expect(page.locator("#portfolio")).toContainText("公开来源暂未披露持仓报告。");
  await page.getByRole("link", { name: "基金对比" }).click();
  await page.getByRole("button", { name: /易方达消费行业股票/ }).click();
  await page.getByRole("button", { name: "开始对比" }).click();
  await expect(page.getByRole("heading", { name: "共同区间走势" })).toBeVisible();
  await expect(page.getByText("分红再投资复权")).toBeVisible();

  await page.goto("/model-portfolios");
  await expect(page.getByText("先搜索并添加研究库基金，不会一次展示全部标的。")).toBeVisible();
  await expect(page.getByLabel("易方达消费行业股票权重")).toHaveCount(0);
  await page.getByLabel("搜索研究库基金").fill("110022");
  await page.getByRole("button", { name: /易方达消费行业股票.*110022/ }).click();
  await expect(page.getByLabel("易方达消费行业股票权重")).toBeVisible();
  await page.getByLabel("易方达消费行业股票权重").fill("60");
  await expect(page.getByText("合计 60.0% · 现金 40.0%")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "从资料采集开始建立基金判断" })).toBeVisible();
  await page.screenshot({ path: "/tmp/fund-research-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "我的研究库" })).toBeVisible();
  await page.screenshot({ path: "/tmp/fund-research-desktop.png", fullPage: true });
  expect(browserErrors).toEqual([]);
  await prisma.$disconnect();
});

test("removed ledger pages return not found", async ({ page }) => {
  for (const path of ["/login", "/dashboard", "/transactions", "/performance", "/journal", "/audit"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }
});
