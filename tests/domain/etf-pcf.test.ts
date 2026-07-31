import { describe, expect, test } from "vitest";
import { officialEtfPcfParsers } from "@/lib/funds/providers/official-etf-pcf";

describe("official ETF PCF parsers", () => {
  test("normalizes an SSE PCF XML", () => {
    const xml = `<?xml version="1.0"?><SSEPortfolioCompositionFile>
      <FundInstrumentID>510300</FundInstrumentID><CreationRedemptionUnit>900000</CreationRedemptionUnit>
      <TradingDay>20260728</TradingDay><PreTradingDay>20260727</PreTradingDay><NAVperCU>4282452.21</NAVperCU>
      <NAV>4.7583</NAV><PreCashComponent>-96606.21</PreCashComponent><EstimatedCashComponent>98023.21</EstimatedCashComponent>
      <MaxCashRatio>0.5</MaxCashRatio><CreationRedemptionSwitch>1</CreationRedemptionSwitch><PublishIOPVFlag>1</PublishIOPVFlag>
      <ComponentList><Component><InstrumentID>000001</InstrumentID><InstrumentName>平安银行</InstrumentName><Quantity>1600</Quantity>
      <SubstitutionFlag>1</SubstitutionFlag><CreationPremiumRate>0.1</CreationPremiumRate><RedemptionDiscountRate>0.1</RedemptionDiscountRate>
      <SubstitutionCashAmount>17776</SubstitutionCashAmount></Component></ComponentList></SSEPortfolioCompositionFile>`;

    expect(officialEtfPcfParsers.parseEtfPcfXml(xml, "SSE")).toEqual(expect.objectContaining({
      fundCode: "510300",
      tradingDay: "2026-07-28",
      cashComponent: -96606.21,
      maxCashRatio: 0.5,
      creationRedemptionStatus: "申购和赎回皆允许",
      publishIopv: true,
      components: [expect.objectContaining({ instrumentCode: "000001", quantity: 1600, substitutionFlag: "1" })],
    }));
  });

  test("normalizes a SZSE PCF XML with exchange-specific cash substitutes", () => {
    const xml = `<?xml version="1.0"?><PCFFile xmlns="http://ts.szse.cn/Fund">
      <SecurityID>159919</SecurityID><CreationRedemptionUnit>900000.00</CreationRedemptionUnit>
      <TradingDay>20260728</TradingDay><PreTradingDay>20260727</PreTradingDay><EstimateCashComponent>3633.40</EstimateCashComponent>
      <CashComponent>7823.61</CashComponent><NAVperCU>4469138.19</NAVperCU><NAV>4.9657</NAV><MaxCashRatio>0.4</MaxCashRatio>
      <Publish>Y</Publish><Creation>Y</Creation><Redemption>N</Redemption><Components><Component>
      <UnderlyingSecurityID>000001</UnderlyingSecurityID><UnderlyingSymbol>平安银行</UnderlyingSymbol><ComponentShare>1600.00</ComponentShare>
      <SubstituteFlag>2</SubstituteFlag><PremiumRatio>0.34</PremiumRatio><DiscountRatio>0.02</DiscountRatio>
      <CreationCashSubstitute>18999.75</CreationCashSubstitute><RedemptionCashSubstitute>18000.25</RedemptionCashSubstitute>
      </Component></Components></PCFFile>`;

    expect(officialEtfPcfParsers.parseEtfPcfXml(xml, "SZSE")).toEqual(expect.objectContaining({
      fundCode: "159919",
      creationRedemptionStatus: "仅允许申购",
      components: [expect.objectContaining({
        instrumentName: "平安银行",
        creationCashSubstitute: 18999.75,
        redemptionCashSubstitute: 18000.25,
      })],
    }));
  });

  test("extracts the official SZSE XML document path", () => {
    const payload = [{ data: [{ jjdm: "<a href='/modules/report/views/eft_download_new.html?path=%2Ffiles%2Ftext%2FETFDown%2F&filename=pcf_159919_20260728%3B159919ETF20260728&opencode=x'>下载</a>" }] }];
    expect(officialEtfPcfParsers.extractSzseDocumentPath(payload, "159919")).toBe("/files/text/ETFDown/pcf_159919_20260728.xml");
    expect(officialEtfPcfParsers.extractSzseDocumentPath(payload, "159915")).toBeNull();
  });

  test("rejects malformed XML without identity fields", () => {
    expect(() => officialEtfPcfParsers.parseEtfPcfXml("<PCFFile />", "SZSE")).toThrow("缺少基金代码或交易日");
  });
});
