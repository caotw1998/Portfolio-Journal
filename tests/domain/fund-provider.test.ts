import { afterEach, describe, expect, test, vi } from "vitest";
import { eastmoneyParsers } from "@/lib/funds/providers/eastmoney";
import { createEastmoneyFundProvider } from "@/lib/funds/providers/eastmoney";
import { buildDividendAdjustedSeries, calculateSeriesMetrics } from "@/lib/funds/metrics";

afterEach(() => vi.unstubAllGlobals());

describe("Eastmoney fund provider parsers", () => {
  test("parses and filters the public fund catalog shape", () => {
    const source = 'var r = [["110022","YFDXFHH","易方达消费行业股票","股票型","YIFANGDAXIAOFEIHANGYEGUPIAO"],["513100","GTHBNSDKJETF","国泰纳斯达克100ETF","QDII-ETF",""],["515450","HLDB50ETFNF","红利低波50ETF南方","指数型-股票",""],["159632","NSDKETFHA","纳斯达克ETF华安","指数型-股票",""],["007466","ETF feeder","华泰柏瑞中证红利低波ETF联接A","指数型-股票",""]];';
    expect(eastmoneyParsers.parseSearchSource(source)).toEqual([
      expect.objectContaining({ code: "110022", name: "易方达消费行业股票", market: "CN_FUND" }),
      expect.objectContaining({ code: "513100", name: "国泰纳斯达克100ETF", market: "SSE" }),
      expect.objectContaining({ code: "515450", market: "SSE" }),
      expect.objectContaining({ code: "159632", market: "SZSE" }),
      expect.objectContaining({ code: "007466", market: "CN_FUND" }),
    ]);
  });

  test("parses establishment dates from exchange-traded fund rankings", () => {
    const source = 'var rankData = {datas:["512890,红利低波ETF华泰柏瑞,HLD波ETFHTBR,2026-08-03,1.2032,2.4064,0,0,0,0,0,0,0,0,140.64,2018-12-19,,,,,,指数型-股票,0"],allRecords:1,pageIndex:1,pageNum:1,allPages:1};';
    expect(eastmoneyParsers.parseRankSource(source)).toEqual([
      expect.objectContaining({ code: "512890", name: "红利低波ETF华泰柏瑞", market: "SSE", establishedDate: "2018-12-19", type: "指数型-股票" }),
    ]);
  });

  test("parses unit NAV, accumulated NAV and percent return", () => {
    const points = eastmoneyParsers.parseNavPayload({ Data: { LSJZList: [
      { FSRQ: "2026-07-17", DWJZ: "1.2345", LJJZ: "3.4567", JZZZL: "1.25", FHFCZ: "0.23473", FHSP: "每份派现金0.2347元" },
      { FSRQ: "invalid", DWJZ: "--" },
    ] } });
    expect(points).toEqual([{ valuationDate: "2026-07-17", publishedAt: null, unitNav: 1.2345, accumulatedNav: 3.4567, dailyReturn: 0.0125, dividendAmount: 0.23473 }]);
  });

  test("does not interpret an ETF share split as a cash dividend", () => {
    const points = eastmoneyParsers.parseNavPayload({ Data: { LSJZList: [
      { FSRQ: "2026-07-17", DWJZ: "0.6240", LJJZ: "2.4960", JZZZL: "-11.08", FHFCZ: "4.0", FHSP: "每份基金份额分拆4.0份" },
      { FSRQ: "2026-07-18", DWJZ: "0.6200", LJJZ: "2.4800", JZZZL: "-0.64", FHFCZ: "4.0", FHSP: "每份基金份额折算4.0份" },
    ] } });

    expect(points).toEqual([
      {
        valuationDate: "2026-07-17",
        publishedAt: null,
        unitNav: 0.624,
        accumulatedNav: 2.496,
        dailyReturn: -0.1108,
        dividendAmount: null,
        splitFactor: 4,
      },
      {
        valuationDate: "2026-07-18",
        publishedAt: null,
        unitNav: 0.62,
        accumulatedNav: 2.48,
        dailyReturn: -0.0064,
        dividendAmount: null,
        splitFactor: 4,
      },
    ]);
  });

  test("merges the complete unit and accumulated NAV variables", () => {
    const source = [
      'var Data_netWorthTrend = [{"x":1609459200000,"y":1,"equityReturn":0},{"x":1609545600000,"y":1.1,"equityReturn":10,"unitMoney":"分红：每份派现金0.12345元"}];',
      'var Data_ACWorthTrend = [[1609459200000,1],[1609545600000,1.2]];',
    ].join("\n");
    const points = eastmoneyParsers.parseFullNavSource(source);
    expect(points).toEqual([
      expect.objectContaining({ valuationDate: "2021-01-01", unitNav: 1, accumulatedNav: 1, dailyReturn: 0 }),
      expect.objectContaining({ valuationDate: "2021-01-02", unitNav: 1.1, accumulatedNav: 1.2, dividendAmount: 0.12345 }),
    ]);
    expect(points[1]?.dailyReturn).toBeCloseTo(0.22345, 10);
  });

  test("reconstructs the 512890 split-adjusted inception return from exact NAV values", () => {
    const source = [
      'var Data_netWorthTrend = [{"x":1545177600000,"y":1,"equityReturn":0},{"x":1634774400000,"y":1.6357,"equityReturn":63.57},{"x":1634860800000,"y":0.8002,"equityReturn":-2.16,"unitMoney":"拆分：每份基金份额分拆2.0份"},{"x":1785715200000,"y":1.2032,"equityReturn":50.36}];',
      'var Data_ACWorthTrend = [[1545177600000,1],[1634774400000,1.6357],[1634860800000,1.6004],[1785715200000,2.4064]];',
    ].join("\n");

    const points = eastmoneyParsers.parseFullNavSource(source);
    const splitPoint = points.find((point) => point.valuationDate === "2021-10-22");
    expect(splitPoint?.dailyReturn).toBeCloseTo((0.8002 * 2) / 1.6357 - 1, 10);

    const series = buildDividendAdjustedSeries(points.map((point) => ({
      date: point.valuationDate,
      unitNav: point.unitNav,
      dailyReturn: point.dailyReturn,
      dividendAmount: point.dividendAmount,
    })));
    const metrics = calculateSeriesMetrics(series);
    expect(metrics.totalReturn).toBeCloseTo(1.4064, 10);
    expect(metrics.annualizedReturn).toBeCloseTo(0.122, 3);
  });

  test("interprets source timestamps as China market dates instead of the previous UTC day", () => {
    const source = [
      'var Data_netWorthTrend = [{"x":1282233600000,"y":1,"equityReturn":0}];',
      'var Data_ACWorthTrend = [[1282233600000,1]];',
    ].join("\n");
    expect(eastmoneyParsers.parseFullNavSource(source)[0]?.valuationDate).toBe("2010-08-20");
  });

  test("falls back to every archive page when the full NAV source is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("pingzhongdata")) return new Response("var unavailable = true;");
      const pageIndex = new URL(url).searchParams.get("pageIndex");
      const rows = pageIndex === "1"
        ? [{ FSRQ: "2026-01-03", DWJZ: "1.3", LJJZ: "1.3", JZZZL: "1" }, { FSRQ: "2026-01-02", DWJZ: "1.2", LJJZ: "1.2", JZZZL: "2" }]
        : [{ FSRQ: "2026-01-01", DWJZ: "1", LJJZ: "1", JZZZL: "0" }];
      return Response.json({ Data: { LSJZList: rows }, TotalCount: 3, PageSize: 2, PageIndex: Number(pageIndex) });
    }));

    const result = await createEastmoneyFundProvider().nav("110022");
    expect(result.coverage).toMatchObject({ expectedCount: 3, fetchedCount: 3, complete: true, method: "paginated_api" });
    expect(result.data.map((point) => point.valuationDate)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  test("loads complete capital and holder archives from their detail pages", async () => {
    const requests: Array<{ url: string; referer: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, referer: new Headers(init?.headers).get("Referer") });
      if (url.includes("type=cyrjg")) {
        return new Response('var apidata={ content:"<table><tbody><tr><td>2025-12-31</td><td>35.63%</td><td>64.37%</td><td>0.02%</td><td>32.93</td></tr></tbody></table>"};');
      }
      return new Response('var gmbd_apidata={ content:"<table><tbody><tr><td>2026-06-30</td><td>21.03</td><td>14.12</td><td>44.83</td><td>161.07</td><td>96.30%</td></tr></tbody></table>"};');
    }));

    const provider = createEastmoneyFundProvider();
    const [scale, flows, holders] = await Promise.all([
      provider.scale("000390"),
      provider.flows("000390"),
      provider.holders("000390"),
    ]);

    expect(scale.data[0]).toMatchObject({ reportDate: "2026-06-30", netAssets: 161.07, shares: 44.83 });
    expect(flows.data[0]).toMatchObject({ subscriptions: 21.03, redemptions: 14.12, totalShares: 44.83 });
    expect(holders.data[0]).toMatchObject({ institutionPercent: 35.63, individualPercent: 64.37 });
    expect(requests.filter((request) => request.url.includes("type=gmbd"))).toHaveLength(1);
    expect(requests.find((request) => request.url.includes("type=gmbd"))?.referer).toContain("gmbd_000390.html");
    expect(requests.find((request) => request.url.includes("type=cyrjg"))?.referer).toContain("cyrjg_000390.html");
  });

  test("parses profile fields and tolerates missing fields", () => {
    const html = '<table><tr><th>基金管理人</th><td><a>易方达基金</a></td></tr><tr><th>成立日期</th><td>2010-08-20</td></tr><tr><th>申购状态</th><td>开放申购</td></tr><tr><th>赎回状态</th><td>开放赎回</td></tr><tr><th>业绩比较基准</th><td>中证消费指数收益率×80%</td></tr></table>';
    expect(eastmoneyParsers.parseProfileHtml(html)).toEqual({
      fullName: null,
      company: "易方达基金",
      custodian: null,
      issueDate: null,
      establishedDate: "2010-08-20",
      establishedShares: null,
      managementFeeRate: null,
      custodianFeeRate: null,
      salesServiceFeeRate: null,
      benchmarkDescription: "中证消费指数收益率×80%",
      trackingTarget: null,
      investmentObjective: null,
      investmentScope: null,
      investmentStrategy: null,
      dividendPolicy: null,
      riskReturnCharacteristics: null,
      subscribeStatus: "开放申购",
      redeemStatus: "开放赎回",
    });
    expect(eastmoneyParsers.parseProfileHtml("<html></html>").company).toBeNull();
  });

  test("parses Chinese dates, rates and narrative profile sections", () => {
    const html = [
      '<table><tr><th>发行日期</th><td>2010年07月26日</td><th>成立日期/规模</th><td>2010年08月20日 / 63.727亿份</td></tr>',
      '<tr><th>管理费率</th><td>1.20%（每年）</td><th>托管费率</th><td>0.20%（每年）</td></tr></table>',
      '<p>交易状态：<span>开放申购</span><span>开放赎回</span></p>',
      '<h4><label>投资目标</label></h4><div><p>追求长期回报。</p></div>',
      '<h4><label>风险收益特征</label></h4><div><p>预期风险较高。</p></div>',
    ].join("");
    expect(eastmoneyParsers.parseProfileHtml(html)).toMatchObject({
      issueDate: "2010-07-26",
      establishedDate: "2010-08-20",
      establishedShares: 63.727,
      managementFeeRate: 0.012,
      custodianFeeRate: 0.002,
      investmentObjective: "追求长期回报。",
      riskReturnCharacteristics: "预期风险较高。",
      subscribeStatus: "开放申购",
      redeemStatus: "开放赎回",
    });
  });

  test("parses historical manager tenures including co-managers", () => {
    const html = '<h4>基金经理变动一览</h4><table><tr><th>起始期</th><th>截止期</th><th>基金经理</th><th>任职期间</th><th>任职回报</th></tr><tr><td>2021-01-16</td><td>2025-04-11</td><td><a>萧楠</a><a>王元春</a></td><td>4年</td><td>-33.20%</td></tr><tr><td>2025-04-12</td><td>至今</td><td><a>萧楠</a></td><td>1年</td><td>19.07%</td></tr></table>';
    expect(eastmoneyParsers.parseManagerHistoryHtml(html)).toEqual([
      expect.objectContaining({ managerName: "萧楠", startDate: "2021-01-16", endDate: "2025-04-11", tenureReturn: -0.332 }),
      expect.objectContaining({ managerName: "王元春", startDate: "2021-01-16", endDate: "2025-04-11", tenureReturn: -0.332 }),
      expect.objectContaining({ managerName: "萧楠", startDate: "2025-04-12", endDate: null, tenureReturn: 0.1907 }),
    ]);
  });

  test("parses manager and scale JavaScript variables", () => {
    const source = 'var Data_currentFundManager = [{"name":"张三","workTime":"2020-01-02 至今","fundReturn":"25.5"}];\nvar Data_fluctuationScale = {"categories":["2025-12-31","2026-03-31"],"series":[{"data":[10.2,11.8]}]};';
    expect(eastmoneyParsers.parseManagers(source)[0]).toEqual(expect.objectContaining({ managerName: "张三", startDate: "2020-01-02", tenureReturn: 0.255 }));
    expect(eastmoneyParsers.parseScale(source)).toEqual([
      expect.objectContaining({ reportDate: "2025-12-31", netAssets: 10.2 }),
      expect.objectContaining({ reportDate: "2026-03-31", netAssets: 11.8 }),
    ]);
  });

  test("parses the current Eastmoney scale shape that stores values on each series item", () => {
    const source = 'var Data_fluctuationScale = {"categories":["2025-12-31","2026-03-31"],"series":[{"y":61.58,"mom":"6.19%"},{"y":82.05,"mom":"33.25%"}]};';
    expect(eastmoneyParsers.parseScale(source)).toEqual([
      expect.objectContaining({ reportDate: "2025-12-31", netAssets: 61.58 }),
      expect.objectContaining({ reportDate: "2026-03-31", netAssets: 82.05 }),
    ]);
  });

  test("parses complete scale and flow history from the archive table", () => {
    const source = `var gmbd_apidata={ content:"<table><tbody>
      <tr><td>2026-06-30</td><td>21.03</td><td>14.12</td><td>44.83</td><td>161.07</td><td>96.30%</td></tr>
      <tr><td>2014-06-30</td><td>0.20</td><td>0.10</td><td>5.96</td><td>7.50</td><td>-1.20%</td></tr>
    </tbody></table>"};`;

    expect(eastmoneyParsers.parseScaleArchive(source)).toEqual([
      { reportDate: "2026-06-30", netAssets: 161.07, shares: 44.83, holderCount: null },
      { reportDate: "2014-06-30", netAssets: 7.5, shares: 5.96, holderCount: null },
    ]);
    expect(eastmoneyParsers.parseFlowArchive(source)).toEqual([
      { reportDate: "2026-06-30", subscriptions: 21.03, redemptions: 14.12, totalShares: 44.83 },
      { reportDate: "2014-06-30", subscriptions: 0.2, redemptions: 0.1, totalShares: 5.96 },
    ]);
  });

  test("parses complete holder history including individual investor ratio", () => {
    const source = `var apidata={ content:"<table><tbody>
      <tr><td>2025-12-31</td><td>35.63%</td><td>64.37%</td><td>0.02%</td><td>32.93</td></tr>
      <tr><td>2014-06-30</td><td>81.00%</td><td>19.00%</td><td>0.02%</td><td>15.70</td></tr>
    </tbody></table>"};`;

    expect(eastmoneyParsers.parseHolderArchive(source)).toEqual([
      { reportDate: "2025-12-31", institutionPercent: 35.63, individualPercent: 64.37, internalPercent: 0.02 },
      { reportDate: "2014-06-30", institutionPercent: 81, individualPercent: 19, internalPercent: 0.02 },
    ]);
  });

  test("parses indexed allocation, subscription flow and holder structure series", () => {
    const source = [
      'var Data_assetAllocation = {"series":[{"name":"股票占净比","data":[87.92,87.24]},{"name":"债券占净比","data":[0,1.2]},{"name":"现金占净比","data":[16.09,13.82]}],"categories":["2025-12-31","2026-03-31"]};',
      'var Data_buySedemption = {"series":[{"name":"期间申购","data":[15.04,15.41]},{"name":"期间赎回","data":[12.93,10.41]},{"name":"总份额","data":[32.93,37.92]}],"categories":["2025-12-31","2026-03-31"]};',
      'var Data_holderStructure = {"series":[{"name":"机构持有比例","data":[57.25,40.4]},{"name":"个人持有比例","data":[42.75,59.6]},{"name":"内部持有比例","data":[0.0439,0.0271]}],"categories":["2025-12-31","2026-03-31"]};',
    ].join("\n");
    expect(eastmoneyParsers.parseAllocationHistory(source).get("2026-03-31")).toMatchObject({
      stockPercent: 87.24,
      bondPercent: 1.2,
      cashPercent: 13.82,
    });
    expect(eastmoneyParsers.parseFlows(source)[1]).toMatchObject({
      reportDate: "2026-03-31",
      subscriptions: 15.41,
      redemptions: 10.41,
      totalShares: 37.92,
    });
    expect(eastmoneyParsers.parseHolders(source)[1]).toMatchObject({
      reportDate: "2026-03-31",
      institutionPercent: 40.4,
      individualPercent: 59.6,
      internalPercent: 0.0271,
    });
  });

  test("returns empty data for malformed optional sections", () => {
    expect(eastmoneyParsers.parseManagers("rate limited")).toEqual([]);
    expect(eastmoneyParsers.parseScale("var bad = true;")).toEqual([]);
  });

  test("combines stock, bond and industry disclosures", () => {
    const stockHtml = '<p>2026-03-31</p><table><tr><td>1</td><td>贵州茅台</td><td>600519</td><td>8.50%</td></tr></table>';
    const bondHtml = '<table><tr><td>1</td><td>国债26</td><td>019766</td><td>4.20%</td></tr></table>';
    const industryHtml = '<table><tr><td>1</td><td>食品饮料</td><td>20.10%</td></tr></table>';
    const portfolio = eastmoneyParsers.parsePortfolio("", stockHtml, bondHtml, industryHtml);
    expect(portfolio[0]?.holdings).toEqual([
      expect.objectContaining({ kind: "stock", code: "600519", weight: 8.5, quantity: null }),
      expect.objectContaining({ kind: "bond", code: "019766", weight: 4.2, quantity: null }),
    ]);
    expect(portfolio[0]?.industries).toEqual([{ name: "食品饮料", weight: 20.1 }]);
  });

  test("groups expanded holdings by report date and parses quantity and market value", () => {
    const stockHtml = [
      '<h4>2025年2季度股票投资明细 截止至：<font>2025-06-30</font></h4>',
      '<table><tr><th>序号</th><th>股票代码</th><th>股票名称</th><th>相关资讯</th><th>占净值比例</th><th>持股数（万股）</th><th>持仓市值（万元）</th></tr>',
      '<tr><td>1</td><td>600519</td><td>贵州茅台</td><td>行情</td><td>8.50%</td><td>109.77</td><td>154,718.78</td></tr></table>',
      '<h4>2025年1季度股票投资明细 截止至：<font>2025-03-31</font></h4>',
      '<table><tr><td>1</td><td>000333</td><td>美的集团</td><td>行情</td><td>7.20%</td><td>200</td><td>10,000</td></tr></table>',
    ].join("");
    const reports = eastmoneyParsers.parsePortfolio("", stockHtml);
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ reportDate: "2025-06-30" });
    expect(reports[0]?.holdings[0]).toMatchObject({ code: "600519", quantity: 109.77, marketValue: 154718.78 });
  });
});
