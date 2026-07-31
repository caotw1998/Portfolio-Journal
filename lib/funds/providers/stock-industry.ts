import { ApiError } from "@/lib/api/responses";

export type StockIndustryResult = {
  code: string;
  industry: string;
  taxonomy: string;
  source: "csindex";
  sourceUrl: string;
};

export function parseCsindexStockIndustry(payload: unknown, code: string) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(root.data) ? root.data : [];
  const row = rows.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).securityCode === code);
  const industry = row && typeof row === "object" ? (row as Record<string, unknown>).cics1stName : null;
  return typeof industry === "string" && industry.trim() ? industry.trim() : null;
}

export async function fetchStockIndustry(code: string, fetchImpl: typeof fetch = fetch) {
  if (!/^\d{6}$/.test(code)) throw new ApiError("仅支持六位 A 股代码的行业查询。", 400);
  const sourceUrl = "https://www.csindex.com.cn/csindex-home/indexInfo/security-industry-search";
  const response = await fetchImpl(sourceUrl, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ searchInput: code, pageNum: 1, pageSize: 10, sortField: null, sortOrder: null }),
  });
  if (!response.ok) throw new ApiError(`中证行业查询失败（${response.status}）。`, 502);
  const industry = parseCsindexStockIndustry(await response.json(), code);
  if (!industry) throw new ApiError("中证未返回股票一级行业。", 502);
  return { code, industry, taxonomy: "中证一级行业", source: "csindex" as const, sourceUrl };
}
