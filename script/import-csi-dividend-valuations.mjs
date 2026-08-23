import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const BENCHMARK_CODE = "H00922";
const EXPECTED_FIRST_DATE = "2008-05-30";
const EXPECTED_LAST_DATE = "2026-08-21";
const EXPECTED_ROW_COUNT = 223;
const SOURCE = "touzid_excel_history";

function requiredNumber(value, field, date) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${date} 的 ${field} 不是有效数字。`);
  return parsed;
}

function parseWorkbook(buffer, valueHeader) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("估值 Excel 没有工作表。");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });
  const header = rows[0] ?? [];
  const dateIndex = header.indexOf("日期");
  const codeIndex = header.indexOf("代码");
  const valueIndex = header.indexOf(valueHeader);
  if (dateIndex < 0 || codeIndex < 0 || valueIndex < 0) throw new Error(`估值 Excel 缺少 日期、代码 或 ${valueHeader} 列。`);
  const values = new Map();
  for (const row of rows.slice(1)) {
    const date = String(row[dateIndex] ?? "").trim();
    const code = String(row[codeIndex] ?? "").trim().toLowerCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) throw new Error(`无效日期：${date || "空"}。`);
    if (code !== "sh000922") throw new Error(`${date} 的指数代码不是 sh000922。`);
    if (values.has(date)) throw new Error(`估值 Excel 存在重复日期：${date}。`);
    values.set(date, requiredNumber(row[valueIndex], valueHeader, date));
  }
  return values;
}

function equalDateSets(left, right) {
  return left.size === right.size && Array.from(left.keys()).every((date) => right.has(date));
}

export function parseCsiDividendHistoricalWorkbooks({ peBuffer, pbBuffer, dividendBuffer }) {
  const peValues = parseWorkbook(peBuffer, "PE-TTM-S");
  const pbValues = parseWorkbook(pbBuffer, "PB-S");
  const dividendWorkbook = XLSX.read(dividendBuffer, { type: "buffer" });
  const dividendSheetName = dividendWorkbook.SheetNames[0];
  if (!dividendSheetName) throw new Error("股息率 Excel 没有工作表。");
  const dividendRows = XLSX.utils.sheet_to_json(dividendWorkbook.Sheets[dividendSheetName], { header: 1, raw: true });
  const dividendHeader = dividendRows[0] ?? [];
  const dateIndex = dividendHeader.indexOf("日期");
  const codeIndex = dividendHeader.indexOf("代码");
  const dividendIndex = dividendHeader.indexOf("股息率");
  const riskFreeIndex = dividendHeader.indexOf("无风险收益率");
  if ([dateIndex, codeIndex, dividendIndex, riskFreeIndex].some((index) => index < 0)) throw new Error("股息率 Excel 缺少日期、代码、股息率或无风险收益率列。");
  const dividendValues = new Map();
  for (const row of dividendRows.slice(1)) {
    const date = String(row[dateIndex] ?? "").trim();
    const code = String(row[codeIndex] ?? "").trim().toLowerCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) throw new Error(`无效日期：${date || "空"}。`);
    if (code !== "sh000922") throw new Error(`${date} 的指数代码不是 sh000922。`);
    if (dividendValues.has(date)) throw new Error(`股息率 Excel 存在重复日期：${date}。`);
    dividendValues.set(date, {
      dividendYield: requiredNumber(row[dividendIndex], "股息率", date) * 100,
      riskFreeRate: requiredNumber(row[riskFreeIndex], "无风险收益率", date) * 100,
    });
  }
  if (!equalDateSets(peValues, pbValues) || !equalDateSets(peValues, dividendValues)) throw new Error("三份估值 Excel 的日期集合不一致。");
  const points = Array.from(peValues.keys()).sort().map((date) => ({
    date,
    peTtm: peValues.get(date),
    pb: pbValues.get(date),
    ...dividendValues.get(date),
  }));
  if (points.length !== EXPECTED_ROW_COUNT || points[0]?.date !== EXPECTED_FIRST_DATE || points.at(-1)?.date !== EXPECTED_LAST_DATE) {
    throw new Error(`历史估值范围不符合预期：${points.length} 行，${points[0]?.date ?? "--"} 至 ${points.at(-1)?.date ?? "--"}。`);
  }
  return points;
}

export async function readCsiDividendHistoricalDirectory(directory) {
  const names = await readdir(directory);
  const peName = names.find((name) => name.includes("pettm") && name.endsWith(".xlsx"));
  const pbName = names.find((name) => name.includes("-pb-") && name.endsWith(".xlsx"));
  const dividendName = names.find((name) => name.includes("dividendr") && name.endsWith(".xlsx"));
  if (!peName || !pbName || !dividendName) throw new Error("导入目录必须包含 pettm、pb 和 dividendr 三份 xlsx 文件。");
  return parseCsiDividendHistoricalWorkbooks({
    peBuffer: await readFile(join(directory, peName)),
    pbBuffer: await readFile(join(directory, pbName)),
    dividendBuffer: await readFile(join(directory, dividendName)),
  });
}

export async function replaceCsiDividendHistoricalValuations(prisma, points) {
  const benchmarks = await prisma.benchmarkInstrument.findMany({ where: { code: BENCHMARK_CODE }, take: 2 });
  if (benchmarks.length !== 1) throw new Error(`必须且只能存在一个 ${BENCHMARK_CODE} 指数，当前找到 ${benchmarks.length} 个。`);
  const benchmark = benchmarks[0];
  await prisma.$transaction(async (tx) => {
    await tx.benchmarkValuationSnapshot.deleteMany({ where: { benchmarkInstrumentId: benchmark.id } });
    await tx.benchmarkValuationSnapshot.createMany({ data: points.map((point) => ({
      benchmarkInstrumentId: benchmark.id,
      date: new Date(`${point.date}T00:00:00Z`),
      peTtm: point.peTtm,
      pb: point.pb,
      dividendYield: point.dividendYield,
      riskFreeRate: point.riskFreeRate,
      source: SOURCE,
      sourceUrl: null,
      peSource: SOURCE,
      peSourceUrl: null,
      pbSource: SOURCE,
      pbSourceUrl: null,
      dividendYieldSource: SOURCE,
      dividendYieldSourceUrl: null,
      riskFreeRateSource: SOURCE,
      riskFreeRateSourceUrl: null,
    })) });
    await tx.benchmarkInstrument.update({ where: { id: benchmark.id }, data: { valuationLastSyncError: null } });
  });
  return { benchmarkId: benchmark.id, rows: points.length, firstDate: points[0].date, lastDate: points.at(-1).date };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const directory = argumentValue("--directory");
  if (!directory) throw new Error("请通过 --directory 指定三份估值 Excel 所在目录。");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const points = await readCsiDividendHistoricalDirectory(directory);
  const prisma = new PrismaClient();
  try {
    const result = await replaceCsiDividendHistoricalValuations(prisma, points);
    process.stdout.write(`CSI_DIVIDEND_VALUATIONS_IMPORTED ${result.rows} ${result.firstDate} ${result.lastDate}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "中证红利估值导入失败。"}\n`);
    process.exit(1);
  });
}
