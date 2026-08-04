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
  await page.route("**/api/funds/search?q=**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ code: "110022", name: "易方达消费行业股票", market: "CN_FUND", type: "股票型", source: "eastmoney", establishedDate: "2010-08-20" }] }) }));
  await page.route("**/api/funds", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const fund = await prisma.fund.create({
      data: {
        code: "110022", name: "易方达消费行业股票", fullName: "易方达消费行业股票型证券投资基金", market: "CN_FUND", type: "股票型", latestSyncAt: new Date(),
        company: "易方达基金", custodian: "农业银行", issueDate: new Date("2010-07-26T00:00:00Z"), establishedDate: new Date("2010-08-20T00:00:00Z"),
        managementFeeRate: 0.012, custodianFeeRate: 0.002, salesServiceFeeRate: 0, investmentObjective: "追求超越业绩比较基准的投资回报。", riskReturnCharacteristics: "预期风险与收益较高。",
        followers: { create: { userId: user.id } },
        scaleSnapshots: { create: [
          { reportDate: new Date("2024-06-30T00:00:00Z"), netAssets: 8.1, shares: 6.9, source: "eastmoney" },
          { reportDate: new Date("2024-12-31T00:00:00Z"), netAssets: 8.8, shares: 7.1, source: "eastmoney" },
          { reportDate: new Date("2025-03-31T00:00:00Z"), netAssets: 9.4, shares: 7.4, source: "eastmoney" },
          { reportDate: new Date("2026-06-30T00:00:00Z"), netAssets: 12.5, shares: 8.2, source: "eastmoney" },
          { reportDate: new Date("2025-12-31T00:00:00Z"), netAssets: 10.25, shares: 7.8, source: "eastmoney" },
        ] },
        flowSnapshots: { create: [
          { reportDate: new Date("2024-06-30T00:00:00Z"), subscriptions: 0.8, redemptions: 0.4, totalShares: 6.9, source: "eastmoney" },
          { reportDate: new Date("2024-12-31T00:00:00Z"), subscriptions: 0.7, redemptions: 0.5, totalShares: 7.1, source: "eastmoney" },
          { reportDate: new Date("2025-03-31T00:00:00Z"), subscriptions: 0.9, redemptions: 0.6, totalShares: 7.4, source: "eastmoney" },
          { reportDate: new Date("2026-06-30T00:00:00Z"), subscriptions: 2.5, redemptions: 1.25, totalShares: 8.2, source: "eastmoney" },
          { reportDate: new Date("2025-12-31T00:00:00Z"), subscriptions: 0.5, redemptions: 1, totalShares: 7.8, source: "eastmoney" },
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
          { reportDate: new Date("2025-12-31T00:00:00Z"), stockPercent: 88, bondPercent: 2, cashPercent: 8, otherPercent: 2, industryJson: [{ name: "食品饮料", weight: 20.1 }, { name: "家用电器", weight: 12.5 }], source: "eastmoney", holdings: { create: [
            { kind: "stock", rank: 1, code: "600519", name: "贵州茅台", weight: 8.5, quantity: 109.77, marketValue: 154718.78 },
            { kind: "bond", rank: 1, code: "110059", name: "浦发转债", weight: 1.2, marketValue: 2000 },
          ] } },
          { reportDate: new Date("2025-06-30T00:00:00Z"), stockPercent: 90, bondPercent: 1, cashPercent: 7, otherPercent: 2, source: "eastmoney", holdings: { create: [
            { kind: "stock", rank: 1, code: "000333", name: "美的集团", weight: 9.32, quantity: 2174.69, marketValue: 157012.33 },
            { kind: "stock", rank: 2, code: "600519", name: "贵州茅台", weight: 7, quantity: 90, marketValue: 130000 },
          ] } },
        ] },
      },
    });
    await prisma.stockIndustryClassification.createMany({ data: [
      { code: "600519", name: "贵州茅台", industry: "主要消费", taxonomy: "中证一级行业", source: "csindex", status: "active", lastSuccessAt: new Date() },
      { code: "000333", name: "美的集团", industry: "可选消费", taxonomy: "中证一级行业", source: "csindex", status: "active", lastSuccessAt: new Date() },
    ] });
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { id: fund.id } }) });
  });
  await page.getByLabel("基金代码或名称").fill("110022");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("易方达消费行业股票").first()).toBeVisible();
  await expect(page.getByText("成立日期 2010-08-20")).toBeVisible();
  await page.getByRole("button", { name: "加入" }).click();
  await expect(page.getByRole("link", { name: "易方达消费行业股票" })).toBeVisible();
  await expect(page.getByText("12.5 亿元")).toBeVisible();
  await expect(page.getByText("1.40% / 年")).toBeVisible();
  await expect(page.getByText("日涨跌", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 年", { exact: true })).toHaveCount(0);
  await expect(page.getByText("3 年", { exact: true })).toHaveCount(0);
  await expect(page.getByText("经理", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^未分类 1$/ })).toBeVisible();
  const researchOutline = page.getByRole("navigation", { name: "研究库页内导航" });
  await expect(researchOutline).toHaveCSS("position", "sticky");

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
  let fundSyncRequests = 0;
  let benchmarkSyncRequests = 0;
  await page.route("**/api/funds/sync?force=true", async (route) => {
    fundSyncRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { runId: "e2e-global-sync", results: [{}] } }) });
  });
  await page.route("**/api/funds/sync/e2e-global-sync", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { status: "partial", items: [{ status: "completed" }, { status: "failed" }] } }) }));
  await page.route("**/api/benchmarks/sync", async (route) => {
    benchmarkSyncRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { total: 1, completed: 1, skipped: 0, failed: 0, results: [] } }) });
  });
  const globalSyncButton = page.getByRole("button", { name: "一键同步所有数据" });
  await globalSyncButton.click();
  await expect(globalSyncButton).toBeDisabled();
  await expect(page.getByText("所有数据同步部分完成：基金 1 只（分区成功 1、失败 1）；指数成功 1、跳过 0、失败 0。")).toBeVisible();
  expect(fundSyncRequests).toBe(1);
  expect(benchmarkSyncRequests).toBe(1);
  await page.unroute("**/api/benchmarks/sync");
  await page.route("**/api/benchmarks/sync", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "指数源暂时不可用" }) }));
  await globalSyncButton.click();
  await expect(page.getByText("所有数据同步部分完成：基金 1 只（分区成功 1、失败 1）；指数失败：指数源暂时不可用。")).toBeVisible();
  browserErrors.length = 0;

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

  const benchmarkValuations = Array.from({ length: 24 }, (_, index) => ({
    date: new Date(Date.UTC(2024, index, 1)),
    peTtm: 10 + index * 0.2,
    pb: index === 23 ? 1.46 : null,
    dividendYield: index === 23 ? 2.68 : null,
    source: "csindex",
    sourceUrl: "https://www.csindex.com.cn/",
  }));
  const benchmark = await prisma.benchmarkInstrument.create({ data: { userId: user.id, code: "000300", market: "CN", name: "沪深300", provider: "public_market", valuationLastSyncAt: new Date(), constituentLastSyncAt: new Date(), priceSnapshots: { create: [
    { date: new Date("2025-08-01T00:00:00Z"), closeValue: 3500, source: "public_market" },
    { date: new Date("2026-07-01T00:00:00Z"), closeValue: 3900, source: "public_market" },
  ] }, valuationSnapshots: { create: benchmarkValuations }, constituentSnapshots: { create: { effectiveDate: new Date("2026-07-31T00:00:00Z"), coverage: "top10", totalWeightPercent: 28.5, source: "csindex", constituents: { create: [
    { rank: 1, code: "600519", name: "贵州茅台", exchange: "上海证券交易所", industry: "主要消费", weightPercent: 5.21 },
    { rank: 2, code: "300750", name: "宁德时代", exchange: "深圳证券交易所", industry: "工业", weightPercent: 3.88 },
  ] } } } } });
  expect(benchmark.id).toBeTruthy();
  await page.route("**/api/benchmarks/search?q=**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    const data = query.includes("全收益") || query.toUpperCase().includes("H20955")
      ? [{ code: "H20955", name: "红利低波100全收益", market: "CN", source: "csindex", sourceSymbol: "H20955" }]
      : query.toUpperCase().includes("SPCLLHCP") || query.includes("标普A股大盘红利低波")
      ? [{ code: "SPCLLHCP", name: "标普中国A股大盘红利低波50指数", market: "GLOBAL", source: "spglobal", sourceSymbol: "^SPCLLHCP" }]
      : [{ code: "SPX", name: "标普500", market: "GLOBAL", source: "eastmoney", sourceSymbol: "100.SPX" }];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  });
  await page.route("**/api/benchmarks/*/sync", async (route) => {
    const benchmarkId = new URL(route.request().url()).pathname.split("/").at(-2);
    if (!benchmarkId) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "missing id" }) });
    const storedBenchmark = await prisma.benchmarkInstrument.findUniqueOrThrow({ where: { id: benchmarkId } });
    if (storedBenchmark.code === "SPCLLHCP") {
      await prisma.benchmarkInstrument.update({ where: { id: benchmarkId }, data: { status: "active", lastSyncAt: new Date(), lastSyncError: null, priceSnapshots: { create: [
        { date: new Date("2026-07-23T00:00:00Z"), closeValue: 1.201, source: "proxy_etf_515450" },
        { date: new Date("2026-07-24T00:00:00Z"), closeValue: 1.215, source: "proxy_etf_515450" },
      ] } } });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: benchmarkId } }) });
    }
    await prisma.benchmarkInstrument.update({ where: { id: benchmarkId }, data: { status: "active", lastSyncAt: new Date(), lastSyncError: null, priceSnapshots: { create: [
      { date: new Date("2026-07-23T00:00:00Z"), closeValue: 6380.1, source: "public_market" },
      { date: new Date("2026-07-24T00:00:00Z"), closeValue: 6412.45, source: "public_market" },
    ] } } });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: benchmarkId } }) });
  });
  await page.goto("/benchmarks");
  const benchmarkDisclosures = page.locator("details[data-responsive-disclosure]");
  await expect(benchmarkDisclosures).toHaveCount(3);
  for (const disclosure of await benchmarkDisclosures.all()) await expect(disclosure).toHaveJSProperty("open", true);
  await page.getByRole("link", { name: "沪深300" }).click();
  await expect(page).toHaveURL(new RegExp(`/benchmarks/${benchmark.id}$`));
  await expect(page.getByRole("heading", { name: "沪深300" })).toBeVisible();
  const detailNavigation = page.getByRole("navigation", { name: "指数详情导航" });
  await expect(detailNavigation.getByRole("link")).toHaveCount(4);
  const valuationSection = page.getByRole("heading", { name: "估值位置" }).locator("xpath=ancestor::section[1]");
  await expect(valuationSection).toBeVisible();
  await expect(valuationSection.getByRole("button", { name: /市盈率（PE）/ })).toBeVisible();
  const valuationChart = valuationSection.getByTestId("benchmark-valuation-chart");
  const valuationRangeControls = valuationSection.getByTestId("benchmark-valuation-range-controls-row");
  const [valuationChartBox, valuationRangeControlsBox] = await Promise.all([valuationChart.boundingBox(), valuationRangeControls.boundingBox()]);
  expect(valuationChartBox).not.toBeNull();
  expect(valuationRangeControlsBox).not.toBeNull();
  expect(valuationRangeControlsBox!.y - (valuationChartBox!.y + valuationChartBox!.height)).toBeLessThanOrEqual(8);
  await valuationSection.getByRole("button", { name: "估值时间区间：近3年" }).click();
  await expect(valuationSection.getByRole("menuitem", { name: "近5年" })).toBeVisible();
  await valuationSection.getByRole("menuitem", { name: "近5年" }).click();
  await expect(valuationSection.getByRole("button", { name: "估值时间区间：近5年" })).toBeVisible();
  await valuationSection.getByRole("button", { name: /股息率/ }).click();
  await expect(valuationSection.getByText(/当前只有.*一个股息率快照/)).toBeVisible();
  await expect(valuationSection.getByTestId("benchmark-valuation-chart")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/benchmark-valuation-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: "/tmp/benchmark-valuation-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: "业绩与风险" })).toBeVisible();
  await expect(page.getByText("3900.00")).toBeVisible();
  await expect(page.getByRole("button", { name: "回撤曲线" })).toBeVisible();
  await page.getByRole("button", { name: "牛熊业绩" }).click();
  await expect(page.getByRole("button", { name: "牛熊业绩" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "指数成分股" })).toBeVisible();
  await expect(page.getByText("贵州茅台")).toBeVisible();
  let detailCompareRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/research/detail-compare")) detailCompareRequests += 1; });
  await expect(page.getByTestId("manager-change-legend")).toHaveCount(0);
  await page.getByRole("button", { name: "添加基准" }).click();
  await page.getByLabel("搜索基金或指数").fill("110022");
  await page.getByRole("button", { name: "易方达消费行业股票 · 110022" }).click();
  await expect(page.getByRole("button", { name: "基准：易方达消费行业股票" })).toBeVisible();
  await expect(page.getByText("基准收益")).toBeVisible();
  expect(detailCompareRequests).toBe(1);
  await page.getByRole("button", { name: /时间区间：/ }).click();
  await page.getByRole("menuitem", { name: "1年" }).click();
  await expect.poll(() => detailCompareRequests).toBe(1);
  await page.goBack();
  const benchmarkOutline = page.getByRole("navigation", { name: "指数库页内导航" });
  await expect(benchmarkOutline).toHaveCSS("position", "sticky");
  await benchmarkOutline.getByRole("link", { name: "多指数比较" }).click();
  await expect(page).toHaveURL(/#benchmark-comparison$/);
  await page.getByLabel("搜索多指数比较").fill("000300");
  await page.getByRole("button", { name: /沪深300.*000300/ }).click();
  await expect(page.getByText("先搜索并添加至少一只")).toHaveCount(0);
  const comparisonChart = page.getByTestId("benchmark-comparison-chart");
  const comparisonRangeControls = page.getByTestId("benchmark-comparison-range-controls-row");
  const [comparisonChartBox, comparisonRangeControlsBox] = await Promise.all([comparisonChart.boundingBox(), comparisonRangeControls.boundingBox()]);
  expect(comparisonChartBox).not.toBeNull();
  expect(comparisonRangeControlsBox).not.toBeNull();
  expect(comparisonRangeControlsBox!.y - (comparisonChartBox!.y + comparisonChartBox!.height)).toBeLessThanOrEqual(8);
  await page.screenshot({ path: "/tmp/benchmark-comparison-controls-desktop.png", fullPage: true });
  await benchmarkOutline.getByRole("link", { name: "发现指数" }).click();
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
  await page.getByLabel("指数代码或名称").fill("红利低波100全收益");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("H20955.CN · csindex")).toBeVisible();
  await expect(page.getByText("搜索不到？手工录入")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/benchmark-search-mobile.png", fullPage: true });
  await page.reload();
  for (const disclosure of await page.locator("details[data-responsive-disclosure]").all()) await expect(disclosure).toHaveJSProperty("open", false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  for (const disclosure of await page.locator("details[data-responsive-disclosure]").all()) await expect(disclosure).toHaveJSProperty("open", true);
  await page.screenshot({ path: "/tmp/benchmark-search-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "设置" }).click();
  const settingsNavigation = page.getByRole("navigation", { name: "设置页内导航" });
  await expect(settingsNavigation.getByRole("link")).toHaveCount(3);
  await settingsNavigation.getByRole("link", { name: "功能说明" }).click();
  await expect(page.getByRole("heading", { name: "功能说明" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "业绩曲线与基准" })).toBeVisible();
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
  const visibleRangeSummary = page.getByTestId("visible-range-performance-summary");
  await expect(visibleRangeSummary).toContainText("成立来收益");
  await expect(visibleRangeSummary).toContainText("年化收益");
  await expect(visibleRangeSummary).toContainText("最大回撤");
  const [visibleRangeSummaryBox, chartTouchAreaBox] = await Promise.all([
    visibleRangeSummary.boundingBox(),
    page.getByTestId("fund-nav-chart-touch-area").boundingBox(),
  ]);
  expect(visibleRangeSummaryBox).not.toBeNull();
  expect(chartTouchAreaBox).not.toBeNull();
  expect(chartTouchAreaBox!.y - (visibleRangeSummaryBox!.y + visibleRangeSummaryBox!.height)).toBeLessThanOrEqual(8);
  const sectionNavigation = page.getByRole("navigation", { name: "基金详情页内导航" });
  const performanceSectionLink = sectionNavigation.getByRole("link", { name: "业绩风险" });
  const capitalSectionLink = sectionNavigation.getByRole("link", { name: "规模资金" });
  const portfolioSectionLink = sectionNavigation.getByRole("link", { name: "持仓变化" });
  const profileSectionLink = sectionNavigation.getByRole("link", { name: "基金档案" });
  const managersSectionLink = sectionNavigation.getByRole("link", { name: "基金经理" });
  const mandateSectionLink = sectionNavigation.getByRole("link", { name: "投资风险" });
  const qualitySectionLink = sectionNavigation.getByRole("link", { name: "数据质量" });
  await expect(sectionNavigation.getByRole("link")).toHaveCount(7);
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
  for (const [link, hash] of [[profileSectionLink, "profile"], [managersSectionLink, "managers"], [mandateSectionLink, "mandate"]] as const) {
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#${hash}$`));
    await expect(link).toHaveAttribute("aria-current", "location");
  }
  await qualitySectionLink.click();
  await expect(page).toHaveURL(/#quality$/);
  await expect(qualitySectionLink).toHaveAttribute("aria-current", "location");
  const stickyNavigationBox = await sectionNavigation.boundingBox();
  expect(stickyNavigationBox).not.toBeNull();
  expect(stickyNavigationBox!.y).toBeGreaterThanOrEqual(0);
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
  await expect(page.getByTestId("capital-scale-chart")).toBeVisible();
  await expect(page.getByTestId("capital-flow-chart")).toBeVisible();
  await expect(page.getByTestId("capital-holder-chart")).toBeVisible();
  await expect(page.getByTestId("capital-period-summary")).toHaveCount(0);
  await expect(page.getByText("精确值可在图中查看")).toBeVisible();
  await expect(page.getByText("第 1 / 2 组")).toBeVisible();
  await page.getByRole("button", { name: "较早三期" }).click();
  await expect(page.getByText(/第 2 \/ 2 组 · 2024-06-30 至 2025-03-31/)).toBeVisible();
  await page.getByRole("button", { name: "较新三期" }).click();
  await expect(page.getByText("2024-01-31 至 2026-07-01 · 4 个观测点")).toHaveCount(0);
  const fundCurveLabel = page.getByRole("button", { name: "易方达消费行业股票", exact: true });
  await expect(fundCurveLabel.locator("span")).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await fundCurveLabel.click();
  await expect(fundCurveLabel).toHaveAttribute("aria-pressed", "true");
  await fundCurveLabel.click();
  await expect(fundCurveLabel).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("2026-07-01 相对起点")).toBeVisible();
  await expect(page.getByText("+28.57%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("年化收益")).toBeVisible();
  await page.getByRole("button", { name: "添加基准" }).click();
  await page.getByLabel("搜索基金或指数").fill("标普A股大盘红利低波");
  await expect(page.getByText("标普中国A股大盘红利低波50指数")).toBeVisible();
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByRole("button", { name: "基准：标普中国A股大盘红利低波50指数" })).toBeVisible();
  expect(browserErrors).toEqual([]);
  browserErrors.length = 0;
  await expect(page.getByRole("button", { name: /基准：标普中国A股大盘红利低波50指数/ })).toBeVisible();
  await page.keyboard.press("Escape");
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
  await expect(page.getByTestId("active-point-metric").first()).toContainText("当前回撤");
  await expect(page.getByTestId("active-point-metric").first()).not.toContainText("相对起点");
  await page.getByRole("button", { name: "业绩曲线" }).click();
  await expect(visibleRangeSummary).toContainText("最大回撤");
  await expect(visibleRangeSummary).toContainText("-10.71%");
  await expect(page.getByTestId("max-drawdown-segment-legend")).toHaveCount(0);
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
  await expect(page.getByTestId("compact-holdings-table")).toContainText("较上期");
  await expect(page.getByTestId("compact-holdings-table").getByRole("table")).toBeVisible();
  await expect(page.getByTestId("compact-holdings-table").getByRole("columnheader")).toHaveText(["标的", "占比", "较上期", "行业"]);
  await expect(page.getByTestId("compact-holdings-table")).not.toContainText("排名");
  await expect(page.getByTestId("compact-holdings-table")).toContainText("+1.50%");
  await expect(page.getByTestId("compact-holdings-table")).not.toContainText("pp");
  await expect(page.getByTestId("compact-holdings-table")).toContainText("主要消费");
  await expect(page.getByTestId("industry-allocation-chart")).toBeVisible();
  await page.getByLabel("持仓报告期").selectOption({ label: "2025-06-30" });
  await expect(page).toHaveURL(/report=.*#portfolio$/);
  await expect(page.getByText("000333")).toBeVisible();
  await expect(page.getByTestId("industry-allocation-chart")).toBeVisible();
  await page.getByRole("button", { name: "时间区间：成立来" }).click();
  await expect(page.getByRole("menuitem", { name: "1年" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "5年" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "10年" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "现任经理以来 · 2025-04-12" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "2024 行情" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "2005—2007 牛市" })).toBeVisible();
  await page.getByRole("menuitem", { name: "现任经理以来 · 2025-04-12" }).click();
  await expect(page.getByRole("button", { name: "时间区间：现任经理以来" })).toBeVisible();
  await expect(page.getByText("2025-06-01 至 2026-07-01 · 3 个观测点")).toHaveCount(0);
  await page.getByRole("button", { name: "时间区间：现任经理以来" }).click();
  await page.getByRole("menuitem", { name: "5年" }).click();
  await expect(page.getByRole("button", { name: "时间区间：5年" })).toBeVisible();
  await page.getByRole("button", { name: "时间区间：5年" }).click();
  await page.getByRole("menuitem", { name: "1年" }).click();
  await expect(page.getByText("2025-08-01 至 2026-07-01 · 2 个观测点")).toHaveCount(0);
  await expect(page.getByText("+16.13%", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "时间区间：1年" }).click();
  await page.getByRole("menuitem", { name: "自定义" }).click();
  await page.getByLabel("开始日期").fill("2024-01-01");
  await page.getByLabel("结束日期").fill("2024-12-31");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await expect(page.getByText("2024-01-31 至 2024-01-31 · 1 个观测点")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const cleanFundDetailUrl = new URL(page.url());
  cleanFundDetailUrl.search = "";
  cleanFundDetailUrl.hash = "";
  await page.goto(cleanFundDetailUrl.toString());
  const globalNavigation = page.getByRole("navigation", { name: "全站主导航" });
  await expect(globalNavigation).toHaveCSS("position", "fixed");
  const globalNavigationBox = await globalNavigation.boundingBox();
  expect(globalNavigationBox).not.toBeNull();
  expect(globalNavigationBox!.y + globalNavigationBox!.height).toBeLessThanOrEqual(844);
  expect(globalNavigationBox!.y + globalNavigationBox!.height).toBeGreaterThanOrEqual(843);
  const globalNavigationWidths = await globalNavigation.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(globalNavigationWidths.scroll).toBe(globalNavigationWidths.client);
  const globalNavigationLinks = globalNavigation.getByRole("link");
  await expect(globalNavigationLinks).toHaveCount(5);
  const globalNavigationLinkBoxes = await globalNavigationLinks.evaluateAll((links) => links.map((link) => link.getBoundingClientRect().toJSON()));
  expect(new Set(globalNavigationLinkBoxes.map((box) => Math.round(box.y))).size).toBe(1);
  const mobileDisclosures = page.locator("details[data-responsive-disclosure]");
  await expect(mobileDisclosures).toHaveCount(6);
  for (const disclosure of await mobileDisclosures.all()) {
    await expect(disclosure).toHaveJSProperty("open", false);
  }
  const performanceSection = page.getByRole("heading", { name: "业绩与风险" }).locator("xpath=ancestor::section[1]");
  await expect(performanceSection.getByText(/点 · \d+ 次分红/)).toHaveCount(0);
  await expect(performanceSection.getByText(/至 .*个观测点/)).toHaveCount(0);
  await expect(performanceSection.getByTestId("drawdown-recovery")).toHaveCount(0);
  await capitalSectionLink.click();
  await expect(page.getByTestId("capital-scale-chart")).toBeVisible();
  await expect(page.getByTestId("capital-flow-chart")).toBeVisible();
  await expect(page.getByTestId("capital-holder-chart")).toBeVisible();
  await expect(page.getByTestId("capital-period-summary")).toHaveCount(0);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await portfolioSectionLink.click();
  const mobileHoldingsTable = page.getByTestId("compact-holdings-table").getByRole("table");
  await expect(mobileHoldingsTable).toBeVisible();
  const mobileHoldingHeaderBoxes = await mobileHoldingsTable.getByRole("columnheader").evaluateAll((headers) => headers.map((header) => header.getBoundingClientRect().toJSON()));
  expect(mobileHoldingHeaderBoxes).toHaveLength(4);
  expect(mobileHoldingHeaderBoxes[3]!.x).toBeGreaterThan(mobileHoldingHeaderBoxes[2]!.x + mobileHoldingHeaderBoxes[2]!.width - 1);
  expect(mobileHoldingHeaderBoxes[3]!.width).toBeGreaterThanOrEqual(75);
  await expect(mobileHoldingsTable.getByRole("columnheader", { name: "行业" })).toHaveCSS("border-left-width", "0px");
  const firstMobileHoldingRow = mobileHoldingsTable.getByRole("row").nth(1);
  const firstMobileHoldingRowBox = await firstMobileHoldingRow.boundingBox();
  expect(firstMobileHoldingRowBox).not.toBeNull();
  expect(firstMobileHoldingRowBox!.height).toBeLessThanOrEqual(44);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await performanceSectionLink.click();
  const [mobileNavigationBox, mobilePerformanceBox] = await Promise.all([
    sectionNavigation.boundingBox(),
    performanceSection.boundingBox(),
  ]);
  expect(mobileNavigationBox).not.toBeNull();
  expect(mobilePerformanceBox).not.toBeNull();
  expect(Math.abs(mobileNavigationBox!.width - mobilePerformanceBox!.width)).toBeLessThan(2);
  const mobileNavigationLinkBoxes = await Promise.all([
    performanceSectionLink.boundingBox(),
    capitalSectionLink.boundingBox(),
  ]);
  expect(mobileNavigationLinkBoxes[0]).not.toBeNull();
  expect(mobileNavigationLinkBoxes[1]).not.toBeNull();
  expect(Math.abs(mobileNavigationLinkBoxes[1]!.y - mobileNavigationLinkBoxes[0]!.y)).toBeLessThan(2);
  const compactNavigationLinkBoxes = await Promise.all([
    performanceSectionLink.boundingBox(),
    capitalSectionLink.boundingBox(),
    portfolioSectionLink.boundingBox(),
    profileSectionLink.boundingBox(),
    managersSectionLink.boundingBox(),
    mandateSectionLink.boundingBox(),
    qualitySectionLink.boundingBox(),
  ]);
  expect(compactNavigationLinkBoxes.every(Boolean)).toBe(true);
  expect(mobileNavigationBox!.height).toBeLessThanOrEqual(94);
  expect(Math.abs(compactNavigationLinkBoxes[3]!.y - compactNavigationLinkBoxes[0]!.y)).toBeLessThan(2);
  expect(compactNavigationLinkBoxes[4]!.y).toBeGreaterThan(compactNavigationLinkBoxes[0]!.y + 20);
  expect(Math.abs(compactNavigationLinkBoxes[6]!.y - compactNavigationLinkBoxes[4]!.y)).toBeLessThan(2);
  const touchArea = page.getByTestId("fund-nav-chart-touch-area");
  const readout = page.getByTestId("fund-performance-readout");
  await touchArea.scrollIntoViewIfNeeded();
  const mobileMetricCells = page.getByTestId("fund-visible-metric-grid").locator(":scope > p");
  await expect(mobileMetricCells).toHaveCount(3);
  const mobileMetricCellBoxes = await mobileMetricCells.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().toJSON()));
  expect(new Set(mobileMetricCellBoxes.map((box) => Math.round(box.y))).size).toBe(1);
  const mobileChartViewSwitch = page.getByTestId("mobile-chart-view-switch");
  await expect(mobileChartViewSwitch).toBeVisible();
  await expect(mobileChartViewSwitch).not.toHaveCSS("position", "fixed");
  const mobileRangeControls = page.getByTestId("fund-chart-range-controls-row");
  await expect(mobileRangeControls.getByRole("button", { name: "1月" })).toBeVisible();
  await expect(mobileRangeControls.getByRole("button", { name: "6月" })).toBeVisible();
  const [mobileQuickRangeBox, mobileBenchmarkButtonBox] = await Promise.all([
    mobileRangeControls.getByRole("button", { name: "1月" }).boundingBox(),
    page.getByRole("button", { name: "添加基准" }).boundingBox(),
  ]);
  expect(mobileQuickRangeBox).not.toBeNull();
  expect(mobileBenchmarkButtonBox).not.toBeNull();
  expect(Math.abs(mobileBenchmarkButtonBox!.y - mobileQuickRangeBox!.y)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "时间区间：成立来" }).click();
  const mobileLongRangeMenu = page.getByRole("menu", { name: "选择时间区间" });
  const mobileLongRangeMenuBox = await mobileLongRangeMenu.boundingBox();
  expect(mobileLongRangeMenuBox).not.toBeNull();
  expect(mobileLongRangeMenuBox!.x).toBeGreaterThanOrEqual(12);
  expect(mobileLongRangeMenuBox!.x + mobileLongRangeMenuBox!.width).toBeLessThanOrEqual(378);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "添加基准" }).click();
  const mobileBenchmarkDialog = page.getByRole("dialog", { name: "选择基准" });
  await expect(mobileBenchmarkDialog).toBeVisible();
  const mobileBenchmarkDialogBox = await mobileBenchmarkDialog.boundingBox();
  expect(mobileBenchmarkDialogBox).not.toBeNull();
  expect(mobileBenchmarkDialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBenchmarkDialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(mobileBenchmarkDialogBox!.x + mobileBenchmarkDialogBox!.width).toBeLessThanOrEqual(390);
  expect(mobileBenchmarkDialogBox!.y + mobileBenchmarkDialogBox!.height).toBeLessThanOrEqual(globalNavigationBox!.y);
  expect(mobileBenchmarkDialogBox!.width).toBeLessThanOrEqual(288);
  expect(mobileBenchmarkDialogBox!.height).toBeLessThanOrEqual(360);
  await page.keyboard.press("Escape");
  const [touchAreaBox, mobileRangeControlsBox, readoutBox] = await Promise.all([touchArea.boundingBox(), mobileRangeControls.boundingBox(), readout.boundingBox()]);
  expect(touchAreaBox).not.toBeNull();
  expect(mobileRangeControlsBox).not.toBeNull();
  expect(readoutBox).not.toBeNull();
  expect(mobileRangeControlsBox!.y).toBeGreaterThanOrEqual(touchAreaBox!.y + touchAreaBox!.height - 1);
  expect(mobileRangeControlsBox!.y - (touchAreaBox!.y + touchAreaBox!.height)).toBeLessThanOrEqual(8);
  expect(readoutBox!.y).toBeGreaterThanOrEqual(mobileRangeControlsBox!.y + mobileRangeControlsBox!.height - 1);
  const chartCanvasBox = await touchArea.locator("canvas").boundingBox();
  expect(chartCanvasBox).not.toBeNull();
  expect(Math.abs(chartCanvasBox!.width - touchAreaBox!.width)).toBeLessThan(2);
  await touchArea.dispatchEvent("pointerdown", { pointerId: 11, pointerType: "touch", clientX: touchAreaBox!.x + touchAreaBox!.width * 0.18, clientY: touchAreaBox!.y + touchAreaBox!.height * 0.5, bubbles: true });
  await touchArea.dispatchEvent("pointerdown", { pointerId: 12, pointerType: "touch", clientX: touchAreaBox!.x + touchAreaBox!.width * 0.82, clientY: touchAreaBox!.y + touchAreaBox!.height * 0.5, bubbles: true });
  await expect(readout.getByText("双指区间")).toBeVisible();
  await expect(readout.getByText("主标的涨跌")).toBeVisible();
  await expect(readout.getByText("主标的年化")).toBeVisible();
  await expect(readout.getByText("最大回撤")).toBeVisible();
  await touchArea.dispatchEvent("pointerup", { pointerId: 11, pointerType: "touch", bubbles: true });
  await touchArea.dispatchEvent("pointerup", { pointerId: 12, pointerType: "touch", bubbles: true });
  await expect(readout.getByText("双指区间")).toBeVisible();
  await readout.getByRole("button", { name: "清除区间" }).click();
  await expect(readout.getByText("单指查看 · 双指比较区间")).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await qualitySectionLink.click();
  await expect(page).toHaveURL(/#quality$/);
  await expect(qualitySectionLink).toHaveAttribute("aria-current", "location");
  await expect(mobileChartViewSwitch).toHaveCount(1);
  await expect(page.locator('details[data-responsive-disclosure="quality"]')).toHaveJSProperty("open", true);
  await expect(page.getByRole("heading", { name: "数据来源与时效" })).toBeVisible();
  const mobileStickyNavigationBox = await sectionNavigation.boundingBox();
  const qualitySectionTop = await page.locator("#quality").evaluate((element) => element.getBoundingClientRect().top);
  expect(mobileStickyNavigationBox).not.toBeNull();
  expect(mobileStickyNavigationBox!.y).toBeGreaterThanOrEqual(0);
  expect(mobileStickyNavigationBox!.y).toBeLessThanOrEqual(1);
  expect(qualitySectionTop).toBeGreaterThanOrEqual(mobileStickyNavigationBox!.height);
  await page.screenshot({ path: "/tmp/fund-detail-sticky-nav-mobile.png" });
  await page.screenshot({ path: "/tmp/fund-detail-data-performance-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  for (const disclosure of await mobileDisclosures.all()) {
    await expect(disclosure).toHaveJSProperty("open", true);
  }
  await expect(page.getByRole("button", { name: "添加基准" })).toBeVisible();
  await page.getByRole("button", { name: "添加基准" }).click();
  await page.getByLabel("搜索基金或指数").fill("000300");
  await page.getByRole("button", { name: "沪深300 · 000300" }).click();
  await expect(page.getByRole("button", { name: "基准：沪深300" })).toBeVisible();
  await expect(page.getByText("成立来收益")).toBeVisible();
  await expect(page.getByText("基准收益")).toBeVisible();
  await expect(page.getByText("年化收益")).toBeVisible();
  await expect(page.getByText("基准年化")).toBeVisible();
  await expect(page.getByText("超额收益")).toBeVisible();
  const benchmarkMetricCells = page.getByTestId("fund-visible-metric-grid").locator(":scope > p");
  await expect(benchmarkMetricCells).toHaveCount(6);
  await expect(benchmarkMetricCells.locator("span")).toHaveText(["成立来收益", "年化收益", "最大回撤", "基准收益", "基准年化", "超额收益"]);
  await page.getByRole("button", { name: "电脑", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-layout-mode", "desktop");
  await expect(page.getByTestId("fund-visible-metric-grid")).toHaveCSS("grid-template-columns", /^\S+ \S+ \S+ \S+ \S+ \S+$/);
  const benchmarkMetricCellBoxes = await benchmarkMetricCells.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().toJSON()));
  expect(new Set(benchmarkMetricCellBoxes.map((box) => Math.round(box.y))).size).toBe(1);
  const desktopRangeButtonBox = await page.getByTestId("fund-chart-range-controls-row").getByRole("button", { name: "1月" }).boundingBox();
  const desktopBenchmarkButtonBox = await page.getByRole("button", { name: "基准：沪深300" }).boundingBox();
  expect(desktopRangeButtonBox).not.toBeNull();
  expect(desktopBenchmarkButtonBox).not.toBeNull();
  expect(Math.abs(desktopBenchmarkButtonBox!.y - desktopRangeButtonBox!.y)).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "手机", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-layout-mode", "mobile");
  await expect(page.getByTestId("fund-visible-metric-grid")).toHaveCSS("grid-template-columns", /^\S+ \S+ \S+$/);
  const mobileBenchmarkMetricBoxes = await benchmarkMetricCells.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().toJSON()));
  const mobileMetricRows = mobileBenchmarkMetricBoxes.reduce<Record<number, number>>((rows, box) => {
    const row = Math.round(box.y);
    rows[row] = (rows[row] ?? 0) + 1;
    return rows;
  }, {});
  expect(Object.values(mobileMetricRows)).toEqual([3, 3]);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: "/tmp/fund-detail-benchmark-metrics-forced-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "自动", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-layout-mode", "auto");
  await expect(page.getByTestId("fund-visible-metric-grid")).toHaveCSS("grid-template-columns", /^\S+ \S+ \S+$/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/fund-detail-benchmark-metrics-desktop.png", fullPage: true });
  const benchmarkCurveLabel = page.getByRole("button", { name: "沪深300", exact: true });
  await expect(benchmarkCurveLabel.locator("span")).toHaveCSS("background-color", "rgb(68, 85, 102)");
  await benchmarkCurveLabel.click();
  await expect(benchmarkCurveLabel).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "基准：沪深300" }).click();
  await page.getByRole("button", { name: "移除基准 沪深300" }).click();
  await expect(page.getByRole("button", { name: "添加基准" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "与录入指数对比" })).toHaveCount(0);
  await qualitySectionLink.click();
  await expect(qualitySectionLink).toHaveAttribute("aria-current", "location");
  await page.screenshot({ path: "/tmp/fund-detail-sticky-nav-desktop.png" });
  await page.screenshot({ path: "/tmp/fund-detail-data-performance-desktop.png", fullPage: true });
  await prisma.stockIndustryClassification.createMany({ data: [
    { code: "000001", name: "平安银行", industry: "金融", taxonomy: "中证一级行业", source: "csindex", status: "active", lastSuccessAt: new Date() },
    { code: "000596", name: "古井贡酒", industry: "主要消费", taxonomy: "中证一级行业", source: "csindex", status: "active", lastSuccessAt: new Date() },
  ] });
  const etfFund = await prisma.fund.create({ data: {
    code: "510300",
    name: "沪深300ETF测试",
    market: "SSE",
    type: "equity",
    vehicleType: "ETF",
    followers: { create: { userId: user.id } },
    portfolioReports: { create: { reportDate: new Date("2026-06-30T00:00:00Z"), source: "eastmoney", holdings: { create: { kind: "stock", rank: 1, code: "600000", name: "浦发银行", weight: 3.2 } } } },
    etfPcfSnapshots: { create: { tradingDay: new Date("2026-07-28T00:00:00Z"), previousTradingDay: new Date("2026-07-27T00:00:00Z"), creationRedemptionUnit: 900000, nav: 4.7583, navPerCreationUnit: 4282452.21, cashComponent: -96606.21, estimatedCashComponent: 98023.21, maxCashRatio: 0.5, creationRedemptionStatus: "申购和赎回皆允许", source: "official_exchange", sourceUrl: "https://etf.sse.com.cn/fundlist/funddetail/?fundCode=510300", components: { create: [
      { instrumentCode: "000001", instrumentName: "平安银行", quantity: 1600, substitutionFlag: "1", creationPremiumRate: 0.1, redemptionDiscountRate: 0.1, substitutionCashAmount: 17776, referenceValue: 72000, basketWeight: 60 },
      { instrumentCode: "000596", instrumentName: "古井贡酒", quantity: 0, substitutionFlag: "2", substitutionCashAmount: 48000, referenceValue: 48000, basketWeight: 40, referencePriceSource: "official_cash_substitute" },
    ] } } },
  } });
  await page.goto(`/funds/${etfFund.id}`);
  await expect(page.getByRole("heading", { name: "申购赎回清单" })).toBeVisible();
  await expect(page.getByLabel("PCF 清单日期")).toHaveValue(/.+/);
  await expect(page.getByTestId("compact-pcf-holdings-table").getByRole("columnheader")).toHaveText(["公司", "占比", "行业"]);
  await expect(page.getByTestId("compact-pcf-holdings-table")).toContainText("60.00%");
  await expect(page.getByTestId("compact-pcf-holdings-table")).toContainText("金融");
  await expect(page.getByTestId("pcf-industry-allocation-chart")).toBeVisible();
  await expect(page.getByTestId("compact-pcf-holdings-table")).not.toContainText("数量");
  await expect(page.getByText("现金替代", { exact: false })).toHaveCount(0);
  await expect(page.getByText("申购溢价", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/etf-pcf-portfolio-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "定期报告持仓" }).click();
  await expect(page.getByRole("heading", { name: "公开持仓" })).toBeVisible();
  await expect(page.getByText("600000")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "手机", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-layout-mode", "mobile");
  await page.getByRole("button", { name: "申购赎回清单" }).click();
  await expect(page.getByText("平安银行").last()).toBeVisible();
  await expect(page.getByTestId("compact-pcf-holdings-table")).toBeVisible();
  await expect(page.getByTestId("pcf-industry-allocation-chart")).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: "/tmp/etf-pcf-portfolio-mobile.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "手机", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "电脑", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-layout-mode", "desktop");
  await page.getByRole("button", { name: "自动", exact: true }).click();
  const emptyPortfolioFund = await prisma.fund.create({ data: {
    code: "000001",
    name: "空持仓测试基金",
    market: "CN_FUND",
    type: "混合型",
    followers: { create: { userId: user.id } },
  } });
  await page.goto(`/funds/${emptyPortfolioFund.id}`);
  await expect(page.locator('details[data-responsive-disclosure="portfolio"]')).toHaveJSProperty("open", false);
  await expect(page.getByText("公开来源暂未披露持仓报告。")).not.toBeVisible();
  await page.getByRole("navigation", { name: "基金详情页内导航" }).getByRole("link", { name: "持仓变化" }).click();
  await expect(page).toHaveURL(/#portfolio$/);
  await expect(page.locator('details[data-responsive-disclosure="portfolio"]')).toHaveJSProperty("open", true);
  await expect(page.locator("#portfolio")).toContainText("公开来源暂未披露持仓报告。");
  await page.getByRole("link", { name: "基金对比" }).click();
  const comparisonOutline = page.getByRole("navigation", { name: "基金对比页内导航" });
  await expect(comparisonOutline).toHaveCSS("position", "sticky");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "手机", exact: true }).click();
  const [fundSearchBox, benchmarkSearchBox] = await Promise.all([
    page.getByTestId("comparison-fund-search").boundingBox(),
    page.getByTestId("comparison-benchmark-search").boundingBox(),
  ]);
  expect(fundSearchBox).not.toBeNull();
  expect(benchmarkSearchBox).not.toBeNull();
  expect(fundSearchBox!.y + fundSearchBox!.height).toBeLessThanOrEqual(benchmarkSearchBox!.y);
  await page.getByLabel("搜索对比基金").fill("110022");
  await page.getByRole("button", { name: /易方达消费行业股票.*110022/ }).click();
  await page.getByLabel("搜索对比指数").fill("000300");
  await page.getByRole("button", { name: /沪深300.*000300/ }).click();
  await page.getByRole("button", { name: "开始对比" }).click();
  await expect(page.getByRole("heading", { name: "共同区间走势" })).toBeVisible();
  await expect(page.getByText("分红再投资复权")).toBeVisible();
  await page.getByRole("button", { name: "自动", exact: true }).click();

  await page.goto("/model-portfolios");
  await expect(page.getByRole("navigation", { name: "模拟组合页内导航" })).toHaveCSS("position", "sticky");
  await expect(page.getByText("先搜索并添加研究库基金，不会一次展示全部标的。")).toBeVisible();
  await expect(page.getByLabel("易方达消费行业股票权重")).toHaveCount(0);
  await page.getByLabel("搜索研究库基金").fill("110022");
  await page.getByRole("button", { name: /易方达消费行业股票.*110022/ }).click();
  await expect(page.getByLabel("易方达消费行业股票权重")).toBeVisible();
  await page.getByLabel("易方达消费行业股票权重").fill("60");
  await expect(page.getByText("合计 60.0% · 现金 40.0%")).toBeVisible();
  await page.getByLabel("搜索模拟组合指数").fill("000300");
  await page.getByRole("button", { name: /沪深300.*000300/ }).click();
  await expect(page.getByRole("button", { name: "移除模拟组合指数 沪深300" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research");
  await expect(globalNavigation.getByRole("link", { name: "研究库" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "从资料采集开始建立基金判断" })).toBeVisible();
  const mobileCategoryNavigation = page.getByRole("navigation", { name: "研究库分类" });
  const categoryWidths = await mobileCategoryNavigation.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(categoryWidths.scroll).toBe(categoryWidths.client);
  await page.locator("#research-library").scrollIntoViewIfNeeded();
  const stickyResearchOutlineBox = await researchOutline.boundingBox();
  expect(stickyResearchOutlineBox).not.toBeNull();
  expect(stickyResearchOutlineBox!.y).toBeGreaterThanOrEqual(0);
  expect(stickyResearchOutlineBox!.y).toBeLessThanOrEqual(1);
  const mobileFundCard = page.locator("#research-library article").filter({ has: page.getByRole("link", { name: "易方达消费行业股票" }) });
  const mobileFundDetails = mobileFundCard.locator('[id^="fund-details-"]');
  await expect(mobileFundDetails).toHaveCount(0);
  await mobileFundCard.getByRole("button", { name: "展开基金详情 ↓" }).click();
  await expect(mobileFundDetails.getByText("12.5 亿元")).toBeVisible();
  await mobileFundCard.getByRole("button", { name: "收起基金详情 ↑" }).click();
  await expect(mobileFundDetails).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [mobilePageContentBox, mobileGlobalNavigationBox] = await Promise.all([
    page.locator("main > div > :last-child").boundingBox(),
    globalNavigation.boundingBox(),
  ]);
  expect(mobilePageContentBox).not.toBeNull();
  expect(mobileGlobalNavigationBox).not.toBeNull();
  expect(mobilePageContentBox!.y + mobilePageContentBox!.height).toBeLessThanOrEqual(mobileGlobalNavigationBox!.y + 1);
  for (const item of [
    { label: "基金对比", path: "/compare" },
    { label: "模拟组合", path: "/model-portfolios" },
    { label: "指数库", path: "/benchmarks" },
    { label: "设置", path: "/settings" },
    { label: "研究库", path: "/research" },
  ]) {
    await globalNavigation.getByRole("link", { name: item.label }).click();
    await expect(page).toHaveURL(new RegExp(`${item.path}$`));
    await expect(globalNavigation.getByRole("link", { name: item.label })).toHaveAttribute("aria-current", "page");
  }
  await page.screenshot({ path: "/tmp/fund-research-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(globalNavigation).not.toHaveCSS("position", "fixed");
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
