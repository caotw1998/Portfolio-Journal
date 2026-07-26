import { ApiError } from "@/lib/api/responses";

export const DEFAULT_CHART_SINGLE_COLOR = "#2f6f9f";
export const DEFAULT_CHART_SERIES_COLORS = [
  "#2f6f9f",
  "#c98352",
  "#2f7d5f",
  "#9a4b5c",
  "#5a659d",
  "#a47a2b",
  "#3f7f8f",
] as const;

export type ChartPreferences = {
  chartSingleColor: string;
  chartSeriesColors: string[];
};

export function parseChartColor(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new ApiError(`${fieldName} must be a six-digit hex color.`);
  }
  return value.toLowerCase();
}

export function parseChartSeriesColors(value: unknown) {
  if (!Array.isArray(value) || value.length !== DEFAULT_CHART_SERIES_COLORS.length) {
    throw new ApiError(`chartSeriesColors must contain exactly ${DEFAULT_CHART_SERIES_COLORS.length} colors.`);
  }
  return value.map((color, index) => parseChartColor(color, `chartSeriesColors[${index}]`));
}
