import { DEFAULT_CHART_SERIES_COLORS, DEFAULT_CHART_SINGLE_COLOR } from "@/lib/chart-preferences";

export const visualToneColors = {
  chartSingle: DEFAULT_CHART_SINGLE_COLOR,
  chartBenchmark: DEFAULT_CHART_SERIES_COLORS,
  gain: "#c94735",
  loss: "#27845f",
  neutral: "#5e675d",
} as const;

export function returnToneClass(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) {
    return "text-muted-foreground";
  }

  return value > 0 ? "text-[#c94735]" : "text-[#27845f]";
}

export function drawdownToneClass(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) {
    return "text-muted-foreground";
  }

  return "text-[#27845f]";
}

export function returnBadgeClass(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) {
    return "border-border bg-background text-muted-foreground";
  }

  return value > 0
    ? "border-border bg-background text-[#c94735]"
    : "border-border bg-background text-[#27845f]";
}
