import { describe, expect, test, vi } from "vitest";
import { fetchStockIndustry, parseCsindexStockIndustry } from "@/lib/funds/providers/stock-industry";

describe("stock industry providers", () => {
  test("parses the official CSI level-one industry", () => {
    expect(parseCsindexStockIndustry({ data: [{ securityCode: "000636", cics1stName: "信息技术", cics4thName: "被动元件" }] }, "000636")).toBe("信息技术");
    expect(parseCsindexStockIndustry({ data: [{ securityCode: "000636", cics1stName: "" }] }, "000636")).toBeNull();
  });

  test("uses only the official CSI classification endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ data: [{ securityCode: "300502", cics1stName: "信息技术" }] });
    });
    await expect(fetchStockIndustry("300502", fetchMock)).resolves.toMatchObject({ industry: "信息技术", source: "csindex", taxonomy: "中证一级行业" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("security-industry-search");
  });
});
