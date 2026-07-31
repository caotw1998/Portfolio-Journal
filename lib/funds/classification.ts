export type FundIdentityInput = {
  code: string;
  name: string | null;
  rawType: string;
  market: string;
};

function exchangeMarketForCode(code: string) {
  if (/^5\d{5}$/.test(code)) return "SSE";
  if (/^15\d{4}$/.test(code)) return "SZSE";
  return null;
}

export function classifyFundIdentity({ code, name, rawType, market }: FundIdentityInput) {
  const text = `${rawType} ${name ?? ""}`;
  const exchangeMarket = exchangeMarketForCode(code);
  const isFeeder = /联接/.test(text);
  const isExchangeEtf = Boolean(exchangeMarket && /ETF/i.test(text) && !isFeeder);
  const normalizedMarket = isExchangeEtf ? exchangeMarket! : market;
  const assetClass = /货币/.test(text) ? "money" : /债券|纯债|固收/.test(text) ? "bond" : /混合/.test(text) ? "mixed" : /股票|指数|ETF/i.test(text) ? "equity" : /FOF/i.test(text) ? "fof" : "other";
  const managementStyle = /增强/.test(text) ? "index_enhanced" : /指数|ETF/i.test(text) ? "index" : "active";
  const vehicleType = isExchangeEtf ? "ETF" : /LOF/i.test(text) ? "LOF" : "open_end";
  const investmentRegion = /QDII|全球|海外|美国|香港/i.test(text) ? "overseas" : "china";
  const shareClass = name?.match(/([A-Z])(?:类)?$/)?.[1] ?? null;
  return { market: normalizedMarket, assetClass, managementStyle, vehicleType, investmentRegion, shareClass };
}

export function inferCatalogMarket(code: string, name: string, rawType: string) {
  const classification = classifyFundIdentity({ code, name, rawType, market: "CN_FUND" });
  if (classification.vehicleType === "ETF") return classification.market;
  if (/LOF|场内/i.test(rawType)) return code.startsWith("5") ? "SSE" : "SZSE";
  return "CN_FUND";
}
