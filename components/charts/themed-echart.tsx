"use client";

import type { EChartsOption, EChartsType } from "echarts";
import ReactECharts from "echarts-for-react";

export function ThemedEChart({
  option,
  height = 320,
  onEvents,
  onChartReady,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (...args: unknown[]) => void>;
  onChartReady?: (instance: EChartsType) => void;
}) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
      onChartReady={onChartReady}
      notMerge
      lazyUpdate
    />
  );
}
