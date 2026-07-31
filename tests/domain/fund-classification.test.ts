import { describe, expect, test } from "vitest";
import { classifyFundIdentity } from "@/lib/funds/classification";

describe("fund identity classification", () => {
  test("recognizes exchange ETFs even when Eastmoney labels them as index funds", () => {
    expect(classifyFundIdentity({ code: "515450", name: "红利低波50ETF南方", rawType: "指数型-股票", market: "CN_FUND" })).toMatchObject({ market: "SSE", vehicleType: "ETF" });
    expect(classifyFundIdentity({ code: "159632", name: "纳斯达克ETF华安", rawType: "指数型-股票", market: "CN_FUND" })).toMatchObject({ market: "SZSE", vehicleType: "ETF" });
  });

  test("does not classify ETF feeder funds as exchange ETFs", () => {
    expect(classifyFundIdentity({ code: "007466", name: "华泰柏瑞中证红利低波ETF联接A", rawType: "指数型-股票", market: "CN_FUND" })).toMatchObject({ market: "CN_FUND", vehicleType: "open_end" });
    expect(classifyFundIdentity({ code: "020602", name: "易方达中证红利低波动ETF联接发起式A", rawType: "指数型-股票", market: "CN_FUND" })).toMatchObject({ market: "CN_FUND", vehicleType: "open_end" });
  });
});
