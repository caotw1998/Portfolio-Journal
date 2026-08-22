import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { syncStock } from "@/lib/stocks/service";
import { createUniqueEmail, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createFollowedStock() {
  const user = await prisma.user.create({ data: { email: createUniqueEmail("stock-history"), passwordHash: "test" } });
  const stock = await prisma.stock.create({
    data: {
      code: "BRK-B", market: "US", name: "伯克希尔哈撒韦 B", sourceSymbol: "BRK-B", currency: "USD",
      followers: { create: { userId: user.id } },
    },
  });
  return { user, stock };
}

function yahooResponse(timestamps: number[], closes: Array<number | null>) {
  return Response.json({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ close: closes }] }, events: { dividends: {} } }] } });
}

describe("stock daily history sync", () => {
  test("requests an explicit full daily window and persists daily closes", async () => {
    const { user, stock } = await createFollowedStock();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("period1")).toBe("0");
      expect(Number(url.searchParams.get("period2"))).toBeGreaterThan(0);
      expect(url.searchParams.get("interval")).toBe("1d");
      expect(url.searchParams.get("range")).toBeNull();
      return yahooResponse([
        Date.UTC(2026, 0, 2) / 1_000,
        Date.UTC(2026, 0, 5) / 1_000,
        Date.UTC(2026, 0, 6) / 1_000,
      ], [500, 505, 510]);
    });

    await syncStock(user.id, stock.id, fetchMock as typeof fetch);

    const prices = await prisma.stockPriceSnapshot.findMany({ where: { stockId: stock.id }, orderBy: { date: "asc" } });
    expect(prices.map((point) => [point.date.toISOString().slice(0, 10), point.close.toNumber()])).toEqual([
      ["2026-01-02", 500], ["2026-01-05", 505], ["2026-01-06", 510],
    ]);
  });

  test("rejects silently downsampled monthly history without deleting existing prices", async () => {
    const { user, stock } = await createFollowedStock();
    await prisma.stockPriceSnapshot.create({ data: { stockId: stock.id, date: new Date("2026-01-02T00:00:00Z"), close: 500, source: "test" } });
    const timestamps = Array.from({ length: 25 }, (_, index) => Date.UTC(2024, index, 1) / 1_000);
    const fetchMock = vi.fn(async () => yahooResponse(timestamps, timestamps.map((_, index) => 400 + index)));

    await expect(syncStock(user.id, stock.id, fetchMock as typeof fetch)).rejects.toMatchObject({
      message: "公开来源返回的不是日线数据，已拒绝覆盖现有历史。",
    });

    const prices = await prisma.stockPriceSnapshot.findMany({ where: { stockId: stock.id } });
    expect(prices).toHaveLength(1);
    await expect(prisma.stock.findUniqueOrThrow({ where: { id: stock.id } })).resolves.toMatchObject({ latestSyncError: "公开来源返回的不是日线数据，已拒绝覆盖现有历史。" });
  });
});
