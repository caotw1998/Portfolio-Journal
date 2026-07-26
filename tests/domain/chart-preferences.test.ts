import { describe, expect, test } from "vitest";
import {
  DEFAULT_CHART_SERIES_COLORS,
  parseChartColor,
  parseChartSeriesColors,
} from "@/lib/chart-preferences";

describe("chart preferences", () => {
  test("accepts six-digit hexadecimal colors and normalizes their case", () => {
    expect(parseChartColor("#A1b2C3", "chartSingleColor")).toBe("#a1b2c3");
  });

  test("requires exactly seven valid series colors", () => {
    expect(parseChartSeriesColors([...DEFAULT_CHART_SERIES_COLORS])).toEqual(DEFAULT_CHART_SERIES_COLORS);
    expect(() => parseChartSeriesColors(["#ffffff"])).toThrow(/7/);
    expect(() => parseChartSeriesColors([...DEFAULT_CHART_SERIES_COLORS.slice(0, 6), "red"])).toThrow(/hex/i);
  });
});
