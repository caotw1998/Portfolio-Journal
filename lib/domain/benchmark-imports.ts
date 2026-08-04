import { csvRecords, validIsoDate } from "@/lib/csv";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/responses";
import { parseBenchmarkConstituentCsv } from "@/lib/domain/benchmark-constituents";

export type BenchmarkValuationCsvRow = {
  indexCode: string;
  date: string;
  peTtm: number | null;
  pb: number | null;
  dividendYield: number | null;
  source: string;
  sourceUrl: string | null;
};

function optionalNumber(value: string, line: number, field: string) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`第 ${line} 行 ${field} 不是有效的非负数字。`);
  return parsed;
}

export function parseBenchmarkValuationCsv(text: string): BenchmarkValuationCsvRow[] {
  return csvRecords(text, ["index_code", "date", "pe_ttm", "pb", "dividend_yield", "source", "source_url"]).map(({ line, value }) => {
    if (!value.index_code || !validIsoDate(value.date) || !value.source) throw new Error(`第 ${line} 行缺少有效的指数代码、日期或来源。`);
    const peTtm = optionalNumber(value.pe_ttm, line, "pe_ttm");
    const pb = optionalNumber(value.pb, line, "pb");
    const dividendYield = optionalNumber(value.dividend_yield, line, "dividend_yield");
    if (peTtm === null && pb === null && dividendYield === null) throw new Error(`第 ${line} 行至少一个估值字段必须有值。`);
    return { indexCode: value.index_code.toUpperCase(), date: value.date, peTtm, pb, dividendYield, source: value.source, sourceUrl: value.source_url || null };
  });
}

async function benchmarkByCode(userId: string, code: string, expectedBenchmarkId?: string) {
  const benchmark = await prisma.benchmarkInstrument.findFirst({ where: { userId, OR: [{ code }, { parentIndexCode: code }] } });
  if (!benchmark) throw new ApiError(`当前工作区不存在指数 ${code}。`, 404);
  if (expectedBenchmarkId && benchmark.id !== expectedBenchmarkId) throw new ApiError(`CSV 指数代码 ${code} 与当前详情页不一致。`, 400);
  return benchmark;
}

export async function importBenchmarkValuationCsv(userId: string, text: string, expectedBenchmarkId?: string) {
  const rows = parseBenchmarkValuationCsv(text);
  const benchmarks = new Map<string, Awaited<ReturnType<typeof benchmarkByCode>>>();
  for (const code of new Set(rows.map((row) => row.indexCode))) benchmarks.set(code, await benchmarkByCode(userId, code, expectedBenchmarkId));
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const benchmark = benchmarks.get(row.indexCode)!;
      const date = new Date(`${row.date}T00:00:00Z`);
      const existing = await tx.benchmarkValuationSnapshot.findUnique({ where: { benchmarkInstrumentId_date: { benchmarkInstrumentId: benchmark.id, date } } });
      await tx.benchmarkValuationSnapshot.upsert({
      where: { benchmarkInstrumentId_date: { benchmarkInstrumentId: benchmark.id, date } },
      create: {
        benchmarkInstrumentId: benchmark.id, date, peTtm: row.peTtm, pb: row.pb, dividendYield: row.dividendYield,
        source: row.source, sourceUrl: row.sourceUrl,
        peSource: row.peTtm === null ? null : row.source, peSourceUrl: row.peTtm === null ? null : row.sourceUrl,
        pbSource: row.pb === null ? null : row.source, pbSourceUrl: row.pb === null ? null : row.sourceUrl,
        dividendYieldSource: row.dividendYield === null ? null : row.source,
        dividendYieldSourceUrl: row.dividendYield === null ? null : row.sourceUrl,
      },
      update: {
        peTtm: row.peTtm ?? existing?.peTtm, pb: row.pb ?? existing?.pb, dividendYield: row.dividendYield ?? existing?.dividendYield,
        source: row.source, sourceUrl: row.sourceUrl,
        peSource: row.peTtm === null ? existing?.peSource : row.source, peSourceUrl: row.peTtm === null ? existing?.peSourceUrl : row.sourceUrl,
        pbSource: row.pb === null ? existing?.pbSource : row.source, pbSourceUrl: row.pb === null ? existing?.pbSourceUrl : row.sourceUrl,
        dividendYieldSource: row.dividendYield === null ? existing?.dividendYieldSource : row.source,
        dividendYieldSourceUrl: row.dividendYield === null ? existing?.dividendYieldSourceUrl : row.sourceUrl,
      },
      });
    }
  });
  return { rows: rows.length, snapshots: new Set(rows.map((row) => `${row.indexCode}|${row.date}`)).size };
}

export async function importBenchmarkConstituentCsv(userId: string, text: string, expectedBenchmarkId?: string) {
  const snapshots = parseBenchmarkConstituentCsv(text);
  const benchmarks = new Map<string, Awaited<ReturnType<typeof benchmarkByCode>>>();
  for (const code of new Set(snapshots.map((snapshot) => snapshot.indexCode))) benchmarks.set(code, await benchmarkByCode(userId, code, expectedBenchmarkId));
  await prisma.$transaction(async (tx) => {
    for (const snapshot of snapshots) {
      const benchmark = benchmarks.get(snapshot.indexCode)!;
      const effectiveDate = new Date(`${snapshot.effectiveDate}T00:00:00Z`);
      const stored = await tx.benchmarkConstituentSnapshot.upsert({
        where: { benchmarkInstrumentId_effectiveDate: { benchmarkInstrumentId: benchmark.id, effectiveDate } },
        create: { benchmarkInstrumentId: benchmark.id, effectiveDate, coverage: snapshot.coverage, source: snapshot.source, sourceUrl: snapshot.sourceUrl },
        update: { coverage: snapshot.coverage, source: snapshot.source, sourceUrl: snapshot.sourceUrl },
      });
      await tx.benchmarkConstituent.deleteMany({ where: { snapshotId: stored.id } });
      await tx.benchmarkConstituent.createMany({ data: snapshot.constituents.map((item) => ({ snapshotId: stored.id, ...item })) });
    }
  });
  return { snapshots: snapshots.length, constituents: snapshots.reduce((sum, snapshot) => sum + snapshot.constituents.length, 0) };
}
