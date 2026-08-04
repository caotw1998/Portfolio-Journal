import { describe, expect, test } from "vitest";
import {
  parseBenchmarkConstituentCsv,
  parseCsindexTopConstituentsPayload,
} from "@/lib/domain/benchmark-constituents";

describe("benchmark constituents", () => {
  test("parses the official CSI top-constituent snapshot", () => {
    expect(parseCsindexTopConstituentsPayload({
      code: "200",
      success: true,
      data: {
        updateDate: "2026-08-04",
        top10Sum: 25.48,
        weightList: [{
          rowNum: "1",
          indexCode: "H30269",
          securityCode: "600750",
          securityName: "华润江中",
          marketNameCn: "上海证券交易所",
          csiTypeL1: "医药卫生",
          preciseWeight: 2.83305232,
        }],
      },
    })).toEqual({
      effectiveDate: "2026-08-04",
      coverage: "top10",
      totalWeightPercent: 25.48,
      constituents: [{
        rank: 1,
        code: "600750",
        name: "华润江中",
        exchange: "上海证券交易所",
        industry: "医药卫生",
        weightPercent: 2.83305232,
      }],
    });
  });

  test("parses quoted historical constituent CSV and groups snapshots", () => {
    const csv = [
      "index_code,effective_date,constituent_code,constituent_name,exchange,weight_percent,industry,source,source_url",
      "H30269,2025-12-31,600750,\"华润江中,股份\",SH,2.83,医药卫生,csindex,https://example.test/a",
      "H30269,2025-12-31,601009,南京银行,SH,2.78,金融,csindex,https://example.test/a",
    ].join("\n");
    expect(parseBenchmarkConstituentCsv(csv)).toEqual([{
      indexCode: "H30269",
      effectiveDate: "2025-12-31",
      source: "csindex",
      sourceUrl: "https://example.test/a",
      coverage: "full",
      constituents: [
        { rank: 1, code: "600750", name: "华润江中,股份", exchange: "SH", weightPercent: 2.83, industry: "医药卫生" },
        { rank: 2, code: "601009", name: "南京银行", exchange: "SH", weightPercent: 2.78, industry: "金融" },
      ],
    }]);
  });

  test("rejects malformed weights instead of importing partial history", () => {
    expect(() => parseBenchmarkConstituentCsv([
      "index_code,effective_date,constituent_code,constituent_name,exchange,weight_percent,industry,source,source_url",
      "H30269,2025-12-31,600750,华润江中,SH,not-a-number,医药卫生,csindex,",
    ].join("\n"))).toThrow("第 2 行");
  });
});
