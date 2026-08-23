import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import {
  parseChinabondTenYearHistoryHtml,
  parseCsiDividendIndicatorWorkbook,
} from "@/lib/domain/benchmark-valuation-sources";

describe("official benchmark valuation sources", () => {
  test("reads the official CSI D/P2 column instead of D/P1", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["日期Date", "指数代码Index Code", "股息率1（总股本）D/P1", "股息率2（计算用股本）D/P2"],
      ["20260821", "000922", 4.3, 4.14],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xls" });
    expect(parseCsiDividendIndicatorWorkbook(buffer)).toEqual([{
      date: "2026-08-21",
      dividendYield: 4.14,
      dividendYieldSource: "csindex_dp2",
      dividendYieldSourceUrl: expect.stringContaining("000922indicator.xls"),
    }]);
  });

  test("reads the 10-year value from ChinaBond history rows", () => {
    const html = `<table><tr><td>曲线名称</td><td>日期</td><td>3月</td><td>6月</td><td>1年</td><td>3年</td><td>5年</td><td>7年</td><td>10年</td><td>30年</td></tr>
      <tr><td>中债国债收益率曲线</td><td>2026-08-20</td><td></td><td></td><td></td><td></td><td></td><td></td><td>1.6832</td><td></td></tr></table>`;
    expect(parseChinabondTenYearHistoryHtml(html)).toEqual([{
      date: "2026-08-20",
      riskFreeRate: 1.6832,
      riskFreeRateSource: "chinabond_10y_government",
      riskFreeRateSourceUrl: expect.stringContaining("chinabond.com.cn"),
    }]);
  });
});
