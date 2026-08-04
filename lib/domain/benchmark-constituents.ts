import { ApiError } from "@/lib/api/responses";
import { csvRecords, validIsoDate } from "@/lib/csv";

export type BenchmarkConstituent = {
  rank: number;
  code: string;
  name: string;
  exchange: string | null;
  industry: string | null;
  weightPercent: number | null;
};

export type BenchmarkConstituentSnapshotInput = {
  effectiveDate: string;
  coverage: "top10" | "full";
  totalWeightPercent?: number | null;
  constituents: BenchmarkConstituent[];
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function officialDate(value: unknown) {
  if (typeof value !== "string") return null;
  if (validIsoDate(value)) return value;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return null;
}

export function parseCsindexTopConstituentsPayload(payload: unknown): BenchmarkConstituentSnapshotInput {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (root.code !== "200" || root.success !== true) throw new ApiError("中证成分股接口返回了无效数据。", 502);
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const effectiveDate = officialDate(data.updateDate);
  const rows = Array.isArray(data.weightList) ? data.weightList : [];
  if (!effectiveDate || !rows.length) throw new ApiError("中证成分股接口未返回有效快照。", 502);
  const constituents = rows.flatMap((row, index) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const code = stringValue(item.securityCode);
    const name = stringValue(item.securityName);
    if (!code || !name) return [];
    return [{
      rank: finiteNumber(item.rowNum) ?? index + 1,
      code,
      name,
      exchange: stringValue(item.marketNameCn),
      industry: stringValue(item.csiTypeL1) ?? stringValue(item.cics1stName),
      weightPercent: finiteNumber(item.preciseWeight) ?? finiteNumber(item.weight),
    }];
  });
  if (!constituents.length) throw new ApiError("中证成分股接口未返回有效成分股。", 502);
  return { effectiveDate, coverage: "top10", totalWeightPercent: finiteNumber(data.top10Sum), constituents };
}

export type BenchmarkConstituentCsvSnapshot = BenchmarkConstituentSnapshotInput & {
  indexCode: string;
  source: string;
  sourceUrl: string | null;
};

export function parseBenchmarkConstituentCsv(text: string): BenchmarkConstituentCsvSnapshot[] {
  const records = csvRecords(text, ["index_code", "effective_date", "constituent_code", "constituent_name", "exchange", "weight_percent", "industry", "source", "source_url"]);
  const grouped = new Map<string, BenchmarkConstituentCsvSnapshot>();
  for (const record of records) {
    const row = record.value;
    const weightPercent = finiteNumber(row.weight_percent);
    if (!row.index_code || !validIsoDate(row.effective_date) || !row.constituent_code || !row.constituent_name || !row.source)
      throw new Error(`第 ${record.line} 行缺少有效的指数代码、日期、成分股或来源。`);
    if (row.weight_percent && weightPercent === null) throw new Error(`第 ${record.line} 行权重不是有效数字。`);
    if (weightPercent !== null && (weightPercent < 0 || weightPercent > 100)) throw new Error(`第 ${record.line} 行权重必须在 0 至 100 之间。`);
    const key = `${row.index_code.toUpperCase()}|${row.effective_date}`;
    const snapshot = grouped.get(key) ?? {
      indexCode: row.index_code.toUpperCase(), effectiveDate: row.effective_date, source: row.source,
      sourceUrl: row.source_url || null, coverage: "full" as const, constituents: [],
    };
    if (snapshot.source !== row.source || snapshot.sourceUrl !== (row.source_url || null)) throw new Error(`第 ${record.line} 行与同一快照的来源不一致。`);
    snapshot.constituents.push({
      rank: snapshot.constituents.length + 1,
      code: row.constituent_code,
      name: row.constituent_name,
      exchange: row.exchange || null,
      weightPercent,
      industry: row.industry || null,
    });
    grouped.set(key, snapshot);
  }
  return Array.from(grouped.values()).sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));
}

export async function fetchCsindexTopConstituents(indexCode: string, fetchImpl: typeof fetch = fetch) {
  const url = new URL(`https://www.csindex.com.cn/csindex-home/index/weight/top10new/${encodeURIComponent(indexCode)}`);
  const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new ApiError(`中证成分股同步失败（${response.status}）。`, 502);
  return parseCsindexTopConstituentsPayload(await response.json());
}
