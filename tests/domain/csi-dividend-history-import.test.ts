import { describe, expect, test, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  parseCsiDividendHistoricalWorkbooks,
  replaceCsiDividendHistoricalValuations,
} from "@/script/import-csi-dividend-valuations.mjs";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "SheetJS");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function historicalDates() {
  const dates = ["2008-05-30"];
  const cursor = new Date("2008-05-31T00:00:00Z");
  while (dates.length < 222) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  dates.push("2026-08-21");
  return dates;
}

describe("CSI dividend historical import", () => {
  test("imports only raw fields and converts percentage decimals", () => {
    const dates = historicalDates();
    const peRows = [["日期", "代码", "股票名称", "PE-TTM-S", "危险值", "中位值", "机会值", "全收益指数", "分位点"], ...dates.map((date) => [date, "sh000922", "中证红利", date === "2026-08-21" ? "8.56" : "10.00", 99, 98, 97, 1234, 0.5])];
    const pbRows = [["日期", "代码", "股票名称", "PB-S", "危险值", "中位值", "机会值", "全收益指数", "分位点"], ...dates.map((date) => [date, "sh000922", "中证红利", date === "2026-08-21" ? "0.83" : "1.00", 9, 8, 7, 1234, 0.5])];
    const dividendRows = [["日期", "代码", "股票名称", "股息率", "无风险收益率"], ...dates.map((date) => [date, "sh000922", "中证红利", date === "2026-08-21" ? "0.0416" : "0.03", date === "2026-08-21" ? "0.0168" : "0.02"])];
    const points = parseCsiDividendHistoricalWorkbooks({ peBuffer: workbookBuffer(peRows), pbBuffer: workbookBuffer(pbRows), dividendBuffer: workbookBuffer(dividendRows) });
    expect(points).toHaveLength(223);
    expect(points.at(-1)).toEqual({ date: "2026-08-21", peTtm: 8.56, pb: 0.83, dividendYield: 4.16, riskFreeRate: 1.68 });
    expect(points.at(-1)).not.toHaveProperty("危险值");
  });

  test("replaces one exact benchmark inside a single transaction", async () => {
    const deleteMany = vi.fn();
    const createMany = vi.fn();
    const update = vi.fn();
    const transaction = vi.fn(async (callback) => callback({ benchmarkValuationSnapshot: { deleteMany, createMany }, benchmarkInstrument: { update } }));
    const prisma = { benchmarkInstrument: { findMany: vi.fn(async () => [{ id: "benchmark-1" }]) }, $transaction: transaction };
    const points = [{ date: "2026-08-21", peTtm: 8.56, pb: 0.83, dividendYield: 4.16, riskFreeRate: 1.68 }];
    await replaceCsiDividendHistoricalValuations(prisma, points);
    await replaceCsiDividendHistoricalValuations(prisma, points);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledWith({ where: { benchmarkInstrumentId: "benchmark-1" } });
    expect(createMany.mock.calls[0]?.[0].data[0]).toMatchObject({ peTtm: 8.56, pb: 0.83, dividendYield: 4.16, riskFreeRate: 1.68, source: "touzid_excel_history" });
  });
});
