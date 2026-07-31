import type {
  FundDataProvider,
  FundHoldingData,
  FundManagerData,
  FundNavPoint,
  FundPortfolioData,
  FundProfileData,
  FundScalePoint,
  FundFlowPoint,
  FundHolderPoint,
  FundSearchResult,
  ProviderResult,
} from "@/lib/funds/providers/types";
import { inferCatalogMarket } from "@/lib/funds/classification";

const SEARCH_URL = "https://fund.eastmoney.com/js/fundcode_search.js";
const NAV_URL = "https://api.fund.eastmoney.com/f10/lsjz";
const FUND_DATA_BASE_URL = "https://fund.eastmoney.com/pingzhongdata";
const FUND_ARCHIVE_BASE_URL = "https://fundf10.eastmoney.com";
let catalogCache: { expiresAt: number; funds: FundSearchResult[] } | null = null;

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[%亿万份,]/g, "").trim();
  const numericText = cleaned.match(/-?\d+(?:\.\d+)?/)?.[0];
  if (!numericText) return null;
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?/);
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
}

function dateFromTimestamp(value: unknown) {
  const timestamp = toNumber(value);
  if (timestamp === null) {
    return null;
  }
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function requestText(url: string, referer = "https://fund.eastmoney.com/") {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: {
      Accept: "application/json,text/javascript,text/html,*/*",
      Referer: referer,
      "User-Agent": "Mozilla/5.0 FundResearch/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`东方财富请求失败（${response.status}）。`);
  }
  return response.text();
}

function extractVariable(source: string, name: string) {
  const marker = `var ${name} =`;
  const start = source.indexOf(marker);
  if (start < 0) {
    return null;
  }
  const valueStart = start + marker.length;
  const end = source.indexOf(";", valueStart);
  if (end < 0) {
    return null;
  }
  const literal = source.slice(valueStart, end).trim();
  try {
    return JSON.parse(literal) as unknown;
  } catch {
    return null;
  }
}

function parseSearchSource(source: string): FundSearchResult[] {
  const match = source.match(/(?:var\s+r\s*=\s*)(\[[\s\S]*\])\s*;?\s*$/);
  if (!match) {
    throw new Error("基金目录格式无法识别。");
  }
  const rows = JSON.parse(match[1]!) as unknown[];
  return rows.flatMap((row) => {
    if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[2] !== "string") {
      return [];
    }
    const category = typeof row[3] === "string" ? row[3] : "基金";
    return [{
      code: row[0],
      name: row[2],
      market: inferCatalogMarket(row[0], row[2], category),
      type: category,
      currency: "CNY",
      source: "eastmoney",
    }];
  });
}

function parseNavPayload(payload: unknown): FundNavPoint[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = root.Data && typeof root.Data === "object" ? root.Data as Record<string, unknown> : {};
  const rows = Array.isArray(data.LSJZList) ? data.LSJZList : [];
  return rows.flatMap((row) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const valuationDate = normalizeDate(item.FSRQ);
    const unitNav = toNumber(item.DWJZ);
    if (!valuationDate || unitNav === null) {
      return [];
    }
    const dailyPercent = toNumber(item.JZZZL);
    const dividendAmount = parseDividendAmount(item.FHFCZ, item.FHSP);
    return [{
      valuationDate,
      publishedAt: null,
      unitNav,
      accumulatedNav: toNumber(item.LJJZ),
      dailyReturn: dailyPercent === null ? null : dailyPercent / 100,
      dividendAmount,
    }];
  });
}

function parseDividendAmount(...values: unknown[]) {
  const descriptions = values.filter((value): value is string => typeof value === "string");
  if (descriptions.some((value) => /拆分|分拆|折算/.test(value))) return null;

  for (const value of values) {
    const direct = toNumber(value);
    if (direct !== null && direct > 0) return direct;
    if (typeof value !== "string") continue;
    const match = value.match(/每份(?:派现金)?\s*([\d.]+)元/);
    const parsed = toNumber(match?.[1]);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function parseFullNavSource(source: string): FundNavPoint[] {
  const unitTrend = extractVariable(source, "Data_netWorthTrend");
  const accumulatedTrend = extractVariable(source, "Data_ACWorthTrend");
  if (!Array.isArray(unitTrend)) return [];

  const accumulatedByDate = new Map<string, number>();
  if (Array.isArray(accumulatedTrend)) {
    for (const value of accumulatedTrend) {
      if (!Array.isArray(value)) continue;
      const valuationDate = dateFromTimestamp(value[0]);
      const accumulatedNav = toNumber(value[1]);
      if (valuationDate && accumulatedNav !== null) {
        accumulatedByDate.set(valuationDate, accumulatedNav);
      }
    }
  }

  return unitTrend.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const valuationDate = dateFromTimestamp(item.x);
    const unitNav = toNumber(item.y);
    if (!valuationDate || unitNav === null) return [];
    const dailyPercent = toNumber(item.equityReturn);
    return [{
      valuationDate,
      publishedAt: null,
      unitNav,
      accumulatedNav: accumulatedByDate.get(valuationDate) ?? null,
      dailyReturn: dailyPercent === null ? null : dailyPercent / 100,
      dividendAmount: parseDividendAmount(item.unitMoney),
    }];
  }).sort((left, right) => left.valuationDate.localeCompare(right.valuationDate));
}

function findArchiveValue(html: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`<t[dh][^>]*>\\s*${label}[^<]*<\\/t[dh]>\\s*<t[dh][^>]*>([\\s\\S]*?)<\\/t[dh]>`, "i");
    const match = html.match(pattern);
    if (match) {
      return stripHtml(match[1]!);
    }
  }
  return null;
}

function parseProfileHtml(html: string): FundProfileData {
  const established = findArchiveValue(html, ["成立日期/规模", "成立日期", "基金成立日"]);
  const pageText = stripHtml(html);
  const rate = (labels: string[]) => {
    const value = toNumber(findArchiveValue(html, labels));
    return value === null ? null : value / 100;
  };
  const section = (label: string) => {
    let labelIndex = html.indexOf(label);
    while (labelIndex >= 0) {
      const headerStart = html.lastIndexOf("<h4", labelIndex);
      const headerEnd = headerStart >= 0 ? html.indexOf("</h4>", headerStart) : -1;
      if (headerStart >= 0 && headerEnd >= labelIndex) {
        const contentStart = headerEnd + 5;
        const nextHeader = html.indexOf("<h4", contentStart);
        const value = stripHtml(html.slice(contentStart, nextHeader >= 0 ? nextHeader : undefined));
        return value || null;
      }
      labelIndex = html.indexOf(label, labelIndex + label.length);
    }
    return null;
  };
  return {
    fullName: findArchiveValue(html, ["基金全称"]),
    company: findArchiveValue(html, ["基金管理人", "管理人"]),
    custodian: findArchiveValue(html, ["基金托管人", "托管人"]),
    issueDate: normalizeDate(findArchiveValue(html, ["发行日期"])),
    establishedDate: normalizeDate(established),
    establishedShares: established && /[亿万]份/.test(established)
      ? toNumber(established.split("/").at(-1))
      : null,
    managementFeeRate: rate(["管理费率"]),
    custodianFeeRate: rate(["托管费率"]),
    salesServiceFeeRate: rate(["销售服务费率"]),
    benchmarkDescription: findArchiveValue(html, ["业绩比较基准"]),
    trackingTarget: findArchiveValue(html, ["跟踪标的"]),
    investmentObjective: section("投资目标"),
    investmentScope: section("投资范围"),
    investmentStrategy: section("投资策略"),
    dividendPolicy: section("分红政策"),
    riskReturnCharacteristics: section("风险收益特征"),
    subscribeStatus: findArchiveValue(html, ["申购状态"])
      ?? pageText.match(/(?:开放|暂停)\s*申购/)?.[0].replace(/\s+/g, "")
      ?? null,
    redeemStatus: findArchiveValue(html, ["赎回状态"])
      ?? pageText.match(/(?:开放|暂停)\s*赎回/)?.[0].replace(/\s+/g, "")
      ?? null,
  };
}

function parseManagers(source: string): FundManagerData[] {
  const raw = extractVariable(source, "Data_currentFundManager");
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const managerName = typeof item.name === "string" ? item.name.trim() : "";
    if (!managerName) {
      return [];
    }
    const tenureText = typeof item.workTime === "string" ? item.workTime : "";
    const dates = tenureText.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g) ?? [];
    return [{
      managerName,
      startDate: normalizeDate(dates[0]),
      endDate: normalizeDate(dates[1]),
      tenureReturn: toNumber(item.fundReturn) === null ? null : toNumber(item.fundReturn)! / 100,
      asOfDate: new Date().toISOString().slice(0, 10),
    }];
  });
}

function parseManagerHistoryHtml(html: string): FundManagerData[] {
  const managers: FundManagerData[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi));
    if (cells.length < 4) continue;
    const startDate = normalizeDate(stripHtml(cells[0]![1]!));
    if (!startDate) continue;
    const endText = stripHtml(cells[1]![1]!);
    const managerCell = cells[2]![1]!;
    const linkedNames = Array.from(managerCell.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi))
      .map((match) => stripHtml(match[1]!))
      .filter(Boolean);
    const managerNames = linkedNames.length ? linkedNames : stripHtml(managerCell).split(/[、,，\s]+/).filter(Boolean);
    const returnValue = toNumber(stripHtml(cells.at(-1)![1]!));
    for (const managerName of managerNames) {
      managers.push({
        managerName,
        startDate,
        endDate: /至今/.test(endText) ? null : normalizeDate(endText),
        tenureReturn: returnValue === null ? null : returnValue / 100,
        asOfDate: new Date().toISOString().slice(0, 10),
      });
    }
  }
  return managers;
}

function parseAllocationHistory(source: string) {
  const raw = extractVariable(source, "Data_assetAllocation");
  const results = new Map<string, {
    stockPercent: number | null;
    bondPercent: number | null;
    cashPercent: number | null;
    otherPercent: number | null;
  }>();
  if (!raw || typeof raw !== "object") {
    return results;
  }
  const record = raw as Record<string, unknown>;
  const categories = Array.isArray(record.categories) ? record.categories : [];
  const series = Array.isArray(record.series)
    ? (raw as Record<string, unknown>).series as unknown[]
    : [];
  for (const value of series) {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const name = typeof item.name === "string" ? item.name : "";
    const points = Array.isArray(item.data) ? item.data : [];
    for (const [index, point] of points.entries()) {
      const reportDate = Array.isArray(point)
        ? dateFromTimestamp(point[0])
        : normalizeDate(categories[index]);
      if (!reportDate) continue;
      const result = results.get(reportDate) ?? { stockPercent: null, bondPercent: null, cashPercent: null, otherPercent: null };
      const percent = toNumber(Array.isArray(point) ? point[1] : point);
      if (/股票/.test(name)) result.stockPercent = percent;
      else if (/债券/.test(name)) result.bondPercent = percent;
      else if (/现金/.test(name)) result.cashPercent = percent;
      else if (/其他|净资产/.test(name)) result.otherPercent = percent;
      results.set(reportDate, result);
    }
  }
  return results;
}

function parseHoldingsHtml(html: string, kind: "stock" | "bond" = "stock") {
  const holdings: FundHoldingData[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((cell) => stripHtml(cell[1]!));
    const rank = Number(cells[0]);
    const code = cells.find((cell) => /^\d{6}$/.test(cell)) ?? null;
    const percentCell = cells.find((cell) => /^-?\d+(?:\.\d+)?%$/.test(cell));
    const name = cells.find((cell, index) => index > 0 && cell && cell !== code && !/^[-+]?\d/.test(cell));
    if (!Number.isInteger(rank) || !name) {
      continue;
    }
    const weight = toNumber(percentCell);
    const percentIndex = percentCell ? cells.indexOf(percentCell) : -1;
    const trailingNumbers = percentIndex >= 0
      ? cells.slice(percentIndex + 1).map(toNumber).filter((value): value is number => value !== null)
      : [];
    holdings.push({
      kind,
      rank,
      code,
      name,
      weight,
      quantity: trailingNumbers[0] ?? null,
      marketValue: trailingNumbers[1] ?? null,
    });
  }
  return holdings;
}

function parseIndustriesHtml(html: string) {
  const industries: Array<{ name: string; weight: number }> = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((cell) => stripHtml(cell[1]!));
    const name = cells.find((cell, index) => index > 0 && cell && !/^[-+]?\d/.test(cell));
    const percent = toNumber(cells.find((cell) => /^-?\d+(?:\.\d+)?%$/.test(cell)));
    if (name && percent !== null) industries.push({ name, weight: percent });
  }
  return industries.slice(0, 20);
}

function parseHoldingReports(html: string, kind: "stock" | "bond") {
  const reports = new Map<string, FundHoldingData[]>();
  const dates = Array.from(html.matchAll(/20\d{2}[-年]\d{1,2}[-月]\d{1,2}(?:日)?/g));
  for (const match of dates) {
    const reportDate = normalizeDate(match[0]);
    if (!reportDate || reports.has(reportDate)) continue;
    const tableStart = html.indexOf("<table", match.index!);
    const tableEnd = tableStart >= 0 ? html.indexOf("</table>", tableStart) : -1;
    if (tableStart >= 0 && tableEnd >= 0) {
      reports.set(reportDate, parseHoldingsHtml(html.slice(tableStart, tableEnd + 8), kind));
    }
  }
  return reports;
}

function parsePortfolio(source: string, stockHtml: string, bondHtml = "", industryHtml = ""): FundPortfolioData[] {
  const allocations = parseAllocationHistory(source);
  const stockReports = parseHoldingReports(stockHtml, "stock");
  const bondReports = parseHoldingReports(bondHtml, "bond");
  const reportDates = new Set([...allocations.keys(), ...stockReports.keys(), ...bondReports.keys()]);
  const fallbackDate = Array.from(reportDates).sort().at(-1)
    ?? normalizeDate(stockHtml.match(/20\d{2}[-年]\d{1,2}[-月]\d{1,2}/)?.[0]);

  if (!stockReports.size && fallbackDate) stockReports.set(fallbackDate, parseHoldingsHtml(stockHtml, "stock"));
  if (!bondReports.size && fallbackDate) bondReports.set(fallbackDate, parseHoldingsHtml(bondHtml, "bond"));
  if (fallbackDate) reportDates.add(fallbackDate);
  const industries = parseIndustriesHtml(industryHtml);

  return Array.from(reportDates).sort((left, right) => right.localeCompare(left)).map((reportDate, index) => {
    const allocation = allocations.get(reportDate) ?? { stockPercent: null, bondPercent: null, cashPercent: null, otherPercent: null };
    return {
      reportDate,
      ...allocation,
      industries: index === 0 ? industries : [],
      holdings: [...(stockReports.get(reportDate) ?? []), ...(bondReports.get(reportDate) ?? [])],
    };
  });
}

function parseAvailableYears(source: string) {
  const match = source.match(/arryear\s*:\s*\[([^\]]*)\]/i);
  return match ? Array.from(match[1]!.matchAll(/20\d{2}/g), (value) => Number(value[0])) : [];
}

async function mapWithConcurrency<T, Result>(items: T[], concurrency: number, callback: (item: T) => Promise<Result>) {
  const results: Result[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...await Promise.all(items.slice(index, index + concurrency).map(callback)));
  }
  return results;
}

function parseScale(source: string): FundScalePoint[] {
  const raw = extractVariable(source, "Data_fluctuationScale");
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const record = raw as Record<string, unknown>;
  const categories = Array.isArray(record.categories) ? record.categories : [];
  const series = Array.isArray(record.series) ? record.series : [];
  const firstSeries = series[0] && typeof series[0] === "object"
    ? series[0] as Record<string, unknown>
    : {};
  const data = Array.isArray(firstSeries.data) ? firstSeries.data : [];
  return categories.flatMap((category, index) => {
    const reportDate = normalizeDate(category);
    if (!reportDate) return [];
    return [{
      reportDate,
      netAssets: toNumber(data[index] ?? (series[index] as Record<string, unknown> | undefined)?.y),
      shares: null,
      holderCount: null,
    }];
  });
}

function parseIndexedSeries(source: string, variableName: string) {
  const raw = extractVariable(source, variableName);
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const categories = Array.isArray(record.categories) ? record.categories : [];
  const series = Array.isArray(record.series) ? record.series : [];
  return categories.flatMap((category, index) => {
    const reportDate = normalizeDate(category);
    if (!reportDate) return [];
    const values = new Map<string, number | null>();
    for (const entry of series) {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const name = typeof item.name === "string" ? item.name : "";
      const data = Array.isArray(item.data) ? item.data : [];
      values.set(name, toNumber(data[index]));
    }
    return [{ reportDate, values }];
  });
}

function parseFlows(source: string): FundFlowPoint[] {
  return parseIndexedSeries(source, "Data_buySedemption").map(({ reportDate, values }) => ({
    reportDate,
    subscriptions: values.get("期间申购") ?? null,
    redemptions: values.get("期间赎回") ?? null,
    totalShares: values.get("总份额") ?? null,
  }));
}

function parseHolders(source: string): FundHolderPoint[] {
  return parseIndexedSeries(source, "Data_holderStructure").map(({ reportDate, values }) => ({
    reportDate,
    institutionPercent: values.get("机构持有比例") ?? null,
    individualPercent: values.get("个人持有比例") ?? null,
    internalPercent: values.get("内部持有比例") ?? null,
  }));
}

function parseArchiveTableRows(source: string) {
  const body = source.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) return [];
  return Array.from(body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi), (row) => (
    Array.from(row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi), (cell) => stripHtml(cell[1]!))
  ));
}

function parseScaleArchive(source: string): FundScalePoint[] {
  return parseArchiveTableRows(source).flatMap((cells) => {
    const reportDate = normalizeDate(cells[0]);
    if (!reportDate || cells.length < 5) return [];
    return [{
      reportDate,
      netAssets: toNumber(cells[4]),
      shares: toNumber(cells[3]),
      holderCount: null,
    }];
  });
}

function parseFlowArchive(source: string): FundFlowPoint[] {
  return parseArchiveTableRows(source).flatMap((cells) => {
    const reportDate = normalizeDate(cells[0]);
    if (!reportDate || cells.length < 5) return [];
    return [{
      reportDate,
      subscriptions: toNumber(cells[1]),
      redemptions: toNumber(cells[2]),
      totalShares: toNumber(cells[3]),
    }];
  });
}

function parseHolderArchive(source: string): FundHolderPoint[] {
  return parseArchiveTableRows(source).flatMap((cells) => {
    const reportDate = normalizeDate(cells[0]);
    if (!reportDate || cells.length < 4) return [];
    return [{
      reportDate,
      institutionPercent: toNumber(cells[1]),
      individualPercent: toNumber(cells[2]),
      internalPercent: toNumber(cells[3]),
    }];
  });
}

export function createEastmoneyFundProvider(): FundDataProvider {
  const capitalArchiveCache = new Map<string, { expiresAt: number; request: Promise<string> }>();

  async function getFundData(code: string) {
    const url = `${FUND_DATA_BASE_URL}/${encodeURIComponent(code)}.js?v=${Date.now()}`;
    return { url, text: await requestText(url) };
  }

  async function getCapitalArchive(code: string) {
    const cached = capitalArchiveCache.get(code);
    if (cached && cached.expiresAt > Date.now()) return cached.request;
    const pageUrl = `${FUND_ARCHIVE_BASE_URL}/gmbd_${encodeURIComponent(code)}.html`;
    const requestUrl = `${FUND_ARCHIVE_BASE_URL}/FundArchivesDatas.aspx?type=gmbd&mode=0&code=${encodeURIComponent(code)}&rt=${Date.now()}`;
    const request = requestText(requestUrl, pageUrl);
    capitalArchiveCache.set(code, { expiresAt: Date.now() + 60_000, request });
    try {
      return await request;
    } catch (error) {
      capitalArchiveCache.delete(code);
      throw error;
    }
  }

  return {
    source: "eastmoney",
    async search(query) {
      if (!catalogCache || catalogCache.expiresAt <= Date.now()) {
        const source = await requestText(SEARCH_URL);
        catalogCache = { funds: parseSearchSource(source), expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
      }
      const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
      return catalogCache.funds
        .filter((fund) =>
          fund.code.includes(normalizedQuery)
          || fund.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
        )
        .slice(0, 20);
    },
    async profile(code): Promise<ProviderResult<FundProfileData>> {
      const sourceUrl = `${FUND_ARCHIVE_BASE_URL}/jbgk_${encodeURIComponent(code)}.html`;
      const raw = await requestText(sourceUrl, sourceUrl);
      return { data: parseProfileHtml(raw), sourceUrl, raw };
    },
    async nav(code, from, to): Promise<ProviderResult<FundNavPoint[]>> {
      if (!from && !to) {
        try {
          const { url, text } = await getFundData(code);
          const data = parseFullNavSource(text);
          if (data.length) {
            return {
              data,
              sourceUrl: url,
              raw: { unitTrend: extractVariable(text, "Data_netWorthTrend"), accumulatedTrend: extractVariable(text, "Data_ACWorthTrend") },
              coverage: { expectedCount: data.length, fetchedCount: data.length, firstDate: data[0]!.valuationDate, lastDate: data.at(-1)!.valuationDate, complete: true, method: "full_source", dividendEventsComplete: true },
            };
          }
        } catch {
          // Fall through to the paginated archive API.
        }
      }
      const parameters = new URLSearchParams({ fundCode: code, pageIndex: "1", pageSize: "20" });
      if (from) parameters.set("startDate", from);
      if (to) parameters.set("endDate", to);
      const sourceUrl = `${NAV_URL}?${parameters}`;
      const firstRaw = JSON.parse(await requestText(sourceUrl, `https://fundf10.eastmoney.com/jjjz_${code}.html`)) as Record<string, unknown>;
      const totalCount = toNumber(firstRaw.TotalCount) ?? parseNavPayload(firstRaw).length;
      const pageSize = Math.max(toNumber(firstRaw.PageSize) ?? 20, 1);
      const pageCount = Math.ceil(totalCount / pageSize);
      const remainingPages = Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) => index + 2);
      const remaining = await mapWithConcurrency(remainingPages, 4, async (pageIndex) => {
        const pageParameters = new URLSearchParams(parameters);
        pageParameters.set("pageIndex", String(pageIndex));
        return JSON.parse(await requestText(`${NAV_URL}?${pageParameters}`, `https://fundf10.eastmoney.com/jjjz_${code}.html`)) as unknown;
      });
      const data = [firstRaw, ...remaining].flatMap(parseNavPayload)
        .filter((point, index, points) => points.findIndex((candidate) => candidate.valuationDate === point.valuationDate) === index)
        .sort((left, right) => left.valuationDate.localeCompare(right.valuationDate));
      const complete = data.length === totalCount;
      if (!complete) throw new Error(`基金净值分页不完整（预期 ${totalCount} 条，实际 ${data.length} 条）。`);
      return {
        data,
        sourceUrl,
        raw: { totalCount, pageSize, pageCount },
        coverage: { expectedCount: totalCount, fetchedCount: data.length, firstDate: data[0]?.valuationDate ?? null, lastDate: data.at(-1)?.valuationDate ?? null, complete, method: "paginated_api" },
      };
    },
    async managers(code) {
      const sourceUrl = `${FUND_ARCHIVE_BASE_URL}/jjjl_${encodeURIComponent(code)}.html`;
      const html = await requestText(sourceUrl, sourceUrl);
      const historical = parseManagerHistoryHtml(html);
      if (historical.length) return { data: historical, sourceUrl, raw: { html } };
      const { url, text } = await getFundData(code);
      return { data: parseManagers(text), sourceUrl: url, raw: { currentManagers: extractVariable(text, "Data_currentFundManager") } };
    },
    async portfolio(code, options) {
      const [{ url, text }, currentStockHtml] = await Promise.all([
        getFundData(code),
        requestText(`${FUND_ARCHIVE_BASE_URL}/FundArchivesDatas.aspx?type=jjcc&code=${encodeURIComponent(code)}&topline=10&year=&month=3%2C6%2C9%2C12`, `${FUND_ARCHIVE_BASE_URL}/ccmx_${code}.html`),
      ]);
      const years = parseAvailableYears(currentStockHtml);
      const currentYear = new Date().getUTCFullYear();
      const requestedYears = options?.fullHistory ? years : years.filter((year) => year === currentYear);
      const historicalYears = requestedYears.filter((year) => year !== currentYear);
      const stockHistory = await mapWithConcurrency(historicalYears, 2, (year) => requestText(`${FUND_ARCHIVE_BASE_URL}/FundArchivesDatas.aspx?type=jjcc&code=${encodeURIComponent(code)}&topline=10&year=${year}&month=3%2C6%2C9%2C12`, `${FUND_ARCHIVE_BASE_URL}/ccmx_${code}.html`));
      const [bondResults, industryResult] = await Promise.all([
        mapWithConcurrency(requestedYears, 2, async (year) => {
          try {
            return await requestText(`${FUND_ARCHIVE_BASE_URL}/FundArchivesDatas.aspx?type=zqcc&code=${encodeURIComponent(code)}&year=${year}`, `${FUND_ARCHIVE_BASE_URL}/ccmx1_${code}.html`);
          } catch {
            return "";
          }
        }),
        requestText(`${FUND_ARCHIVE_BASE_URL}/FundArchivesDatas.aspx?type=hydb&code=${encodeURIComponent(code)}`, `${FUND_ARCHIVE_BASE_URL}/hydb_${code}.html`).catch(() => ""),
      ]);
      const stockHtml = [currentStockHtml, ...stockHistory].join("\n");
      const bondHtml = bondResults.join("\n");
      const data = parsePortfolio(text, stockHtml, bondHtml, industryResult);
      return {
        data,
        sourceUrl: `${FUND_ARCHIVE_BASE_URL}/ccmx_${code}.html`,
        raw: { fundDataUrl: url, years, reportCount: data.length, holdingCount: data.reduce((sum, report) => sum + report.holdings.length, 0) },
      };
    },
    async scale(code) {
      const sourceUrl = `${FUND_ARCHIVE_BASE_URL}/gmbd_${encodeURIComponent(code)}.html`;
      const text = await getCapitalArchive(code);
      const data = parseScaleArchive(text);
      return { data, sourceUrl, raw: { method: "archive_full_history", count: data.length, firstDate: data.at(-1)?.reportDate ?? null, lastDate: data[0]?.reportDate ?? null } };
    },
    async flows(code) {
      const sourceUrl = `${FUND_ARCHIVE_BASE_URL}/gmbd_${encodeURIComponent(code)}.html`;
      const text = await getCapitalArchive(code);
      const data = parseFlowArchive(text);
      return { data, sourceUrl, raw: { method: "archive_full_history", count: data.length, firstDate: data.at(-1)?.reportDate ?? null, lastDate: data[0]?.reportDate ?? null } };
    },
    async holders(code) {
      const sourceUrl = `${FUND_ARCHIVE_BASE_URL}/cyrjg_${encodeURIComponent(code)}.html`;
      const requestUrl = `${FUND_ARCHIVE_BASE_URL}/FundArchivesDatas.aspx?type=cyrjg&code=${encodeURIComponent(code)}&rt=${Date.now()}`;
      const text = await requestText(requestUrl, sourceUrl);
      const data = parseHolderArchive(text);
      return { data, sourceUrl, raw: { method: "archive_full_history", count: data.length, firstDate: data.at(-1)?.reportDate ?? null, lastDate: data[0]?.reportDate ?? null } };
    },
    async officialValidation(code, market) {
      if (market === "SSE") {
        const catalogUrl = "https://etf.sse.com.cn/fundlist/data.js";
        const raw = await requestText(catalogUrl, "https://etf.sse.com.cn/fundlist/");
        const verified = new RegExp(`val:["']${code}["']`).test(raw);
        return { data: { verified, exchange: "SSE" }, sourceUrl: "https://etf.sse.com.cn/fundlist/", raw: { verified, code } };
      }
      const sourceUrl = "https://www.szse.cn/market/product/list/etfList/index.html";
      const raw = await requestText(sourceUrl, sourceUrl);
      const verified = new RegExp(`(?:^|\\D)${code}(?:\\D|$)`).test(stripHtml(raw));
      return { data: { verified, exchange: "SZSE" }, sourceUrl, raw: { verified, code } };
    },
  };
}

export const eastmoneyParsers = {
  parseSearchSource,
  parseNavPayload,
  parseFullNavSource,
  parseProfileHtml,
  parseManagers,
  parseManagerHistoryHtml,
  parsePortfolio,
  parseAllocationHistory,
  parseScale,
  parseScaleArchive,
  parseFlows,
  parseFlowArchive,
  parseHolders,
  parseHolderArchive,
};
