import type { EtfPcfComponentData, EtfPcfData, ProviderResult } from "@/lib/funds/providers/types";

const SSE_DETAIL_URL = "https://etf.sse.com.cn/fundlist/funddetail/";
const SSE_DOWNLOAD_URL = "https://query.sse.com.cn/etfDownload/downloadETF2Bulletin.do";
const SZSE_LIST_URL = "https://www.szse.cn/disclosure/fund/currency/index.html";
const SZSE_REPORT_URL = "https://www.szse.cn/api/report/ShowReport/data";
const SZSE_DOCUMENT_ROOT = "https://reportdocs.static.szse.cn";

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function xmlText(source: string, tag: string) {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1]!.trim()) : null;
}

function numberOrNull(value: string | null) {
  if (value === null || value === "" || value === "-") return null;
  const parsed = Number(value.replaceAll(",", "").replace(/[￥%]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rateOrNull(value: string | null) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return value?.includes("%") ? parsed / 100 : parsed;
}

function dateKey(value: string | null) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function parseComponents(source: string, market: "SSE" | "SZSE") {
  return Array.from(source.matchAll(/<Component>([\s\S]*?)<\/Component>/gi)).map((match): EtfPcfComponentData => {
    const component = match[1]!;
    const isSse = market === "SSE";
    return {
      instrumentCode: xmlText(component, isSse ? "InstrumentID" : "UnderlyingSecurityID") ?? "",
      instrumentName: xmlText(component, isSse ? "InstrumentName" : "UnderlyingSymbol") ?? "未披露",
      quantity: numberOrNull(xmlText(component, isSse ? "Quantity" : "ComponentShare")),
      substitutionFlag: xmlText(component, isSse ? "SubstitutionFlag" : "SubstituteFlag") ?? "",
      creationPremiumRate: rateOrNull(xmlText(component, isSse ? "CreationPremiumRate" : "PremiumRatio")),
      redemptionDiscountRate: rateOrNull(xmlText(component, isSse ? "RedemptionDiscountRate" : "DiscountRatio")),
      substitutionCashAmount: numberOrNull(xmlText(component, "SubstitutionCashAmount")),
      creationCashSubstitute: numberOrNull(xmlText(component, "CreationCashSubstitute")),
      redemptionCashSubstitute: numberOrNull(xmlText(component, "RedemptionCashSubstitute")),
      market: xmlText(component, "UnderlyingSecurityIDSource"),
    };
  }).filter((component) => component.instrumentCode);
}

function sseStatus(value: string | null) {
  if (value === "1") return "申购和赎回皆允许";
  if (value === "2") return "仅允许申购";
  if (value === "3") return "仅允许赎回";
  if (value === "0") return "申购和赎回均暂停";
  return value;
}

export function parseEtfPcfXml(source: string, market: "SSE" | "SZSE"): EtfPcfData {
  const isSse = market === "SSE";
  const fundCode = xmlText(source, isSse ? "FundInstrumentID" : "SecurityID");
  const tradingDay = dateKey(xmlText(source, "TradingDay"));
  if (!fundCode || !tradingDay) throw new Error("ETF 申购赎回清单缺少基金代码或交易日。");

  const creation = xmlText(source, "Creation");
  const redemption = xmlText(source, "Redemption");
  const creationRedemptionStatus = isSse
    ? sseStatus(xmlText(source, "CreationRedemptionSwitch"))
    : creation === "Y" && redemption === "Y"
      ? "申购和赎回皆允许"
      : creation === "Y"
        ? "仅允许申购"
        : redemption === "Y"
          ? "仅允许赎回"
          : "申购和赎回均暂停";

  const limits = {
    creationLimitPerAccount: numberOrNull(xmlText(source, "CreationLimitPerUser")),
    redemptionLimitPerAccount: numberOrNull(xmlText(source, "RedemptionLimitPerUser")),
    netCreationLimit: numberOrNull(xmlText(source, "NetCreationLimit")),
    netRedemptionLimit: numberOrNull(xmlText(source, "NetRedemptionLimit")),
    netCreationLimitPerAccount: numberOrNull(xmlText(source, "NetCreationLimitPerUser")),
    netRedemptionLimitPerAccount: numberOrNull(xmlText(source, "NetRedemptionLimitPerUser")),
  };

  return {
    fundCode,
    tradingDay,
    previousTradingDay: dateKey(xmlText(source, "PreTradingDay")),
    creationRedemptionUnit: numberOrNull(xmlText(source, "CreationRedemptionUnit")),
    navPerCreationUnit: numberOrNull(xmlText(source, "NAVperCU")),
    nav: numberOrNull(xmlText(source, "NAV")),
    cashComponent: numberOrNull(xmlText(source, isSse ? "PreCashComponent" : "CashComponent")),
    estimatedCashComponent: numberOrNull(xmlText(source, isSse ? "EstimatedCashComponent" : "EstimateCashComponent")),
    maxCashRatio: rateOrNull(xmlText(source, "MaxCashRatio")),
    creationRedemptionStatus,
    creationRedemptionMechanism: xmlText(source, "CreationRedemptionMechanism"),
    publishIopv: ["1", "Y"].includes(xmlText(source, isSse ? "PublishIOPVFlag" : "Publish") ?? "")
      ? true
      : ["0", "N"].includes(xmlText(source, isSse ? "PublishIOPVFlag" : "Publish") ?? "")
        ? false
        : null,
    creationLimit: numberOrNull(xmlText(source, "CreationLimit")),
    redemptionLimit: numberOrNull(xmlText(source, "RedemptionLimit")),
    limits,
    components: parseComponents(source, market),
  };
}

async function requestText(url: string, referer: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml,text/plain,application/json;q=0.9,*/*;q=0.8",
      Referer: referer,
      "User-Agent": "Mozilla/5.0 (compatible; PortfolioJournal/1.0)",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ETF PCF 数据请求失败（HTTP ${response.status}）。`);
  return response.text();
}

function shanghaiSource(code: string) {
  const sourceUrl = `${SSE_DETAIL_URL}?fundCode=${encodeURIComponent(code)}`;
  return {
    sourceUrl,
    async load() {
      const xml = await requestText(`${SSE_DOWNLOAD_URL}?fundCode=${encodeURIComponent(code)}`, sourceUrl);
      return { xml, documentUrl: `${SSE_DOWNLOAD_URL}?fundCode=${encodeURIComponent(code)}` };
    },
  };
}

function extractSzseDocumentPath(payload: unknown, code: string) {
  const rows = Array.isArray(payload) ? payload : [];
  const data = rows.flatMap((row) => row && typeof row === "object" && Array.isArray((row as { data?: unknown[] }).data)
    ? (row as { data: Array<{ jjdm?: string }> }).data
    : []);
  const html = data[0]?.jjdm ?? "";
  const match = html.match(/path=([^&'\"]+).*?filename=([^&'\"]+)/i);
  if (!match) return null;
  const decodedPath = decodeURIComponent(match[1]!);
  const [firstName] = decodeURIComponent(match[2]!).split(";");
  if (!firstName || !firstName.includes(code)) return null;
  return `${decodedPath}${firstName}.xml`;
}

function shenzhenSource(code: string, tradingDays: string[]) {
  const sourceUrl = `${SZSE_LIST_URL}?txtJCorDH=${encodeURIComponent(code)}`;
  return {
    sourceUrl,
    async load() {
      for (const tradingDay of tradingDays) {
        const query = new URLSearchParams({
          SHOWTYPE: "JSON",
          CATALOGID: "sgshqd",
          TABKEY: "tab1",
          txtJCorDH: code,
          txtStart: tradingDay,
          txtEnd: tradingDay,
          PAGENO: "1",
        });
        const payload = JSON.parse(await requestText(`${SZSE_REPORT_URL}?${query}`, sourceUrl)) as unknown;
        const documentPath = extractSzseDocumentPath(payload, code);
        if (!documentPath) continue;
        const documentUrl = `${SZSE_DOCUMENT_ROOT}${documentPath}`;
        return { xml: await requestText(documentUrl, sourceUrl), documentUrl };
      }
      throw new Error("深交所最近七日未披露该 ETF 的申购赎回清单。");
    },
  };
}

function chinaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function recentChinaDateKeys(date = new Date()) {
  return Array.from({ length: 7 }, (_, index) => chinaDateKey(new Date(date.getTime() - index * 24 * 60 * 60 * 1000)));
}

export async function fetchOfficialEtfPcf(code: string, market: string): Promise<ProviderResult<EtfPcfData>> {
  if (market !== "SSE" && market !== "SZSE") throw new Error("仅支持沪深交易所 ETF 申购赎回清单。");
  const source = market === "SSE" ? shanghaiSource(code) : shenzhenSource(code, recentChinaDateKeys());
  const { xml, documentUrl } = await source.load();
  const data = parseEtfPcfXml(xml, market);
  if (data.fundCode !== code) throw new Error(`ETF 申购赎回清单代码不匹配：期望 ${code}，实际 ${data.fundCode}。`);
  if (!data.components.length) throw new Error("ETF 申购赎回清单未包含成分证券。");
  return {
    data,
    sourceUrl: source.sourceUrl,
    raw: { market, documentUrl, tradingDay: data.tradingDay, componentCount: data.components.length },
  };
}

export const officialEtfPcfParsers = { parseEtfPcfXml, extractSzseDocumentPath };
