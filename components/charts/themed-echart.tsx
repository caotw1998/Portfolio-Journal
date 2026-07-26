"use client";

import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";

export function ThemedEChart({
  option,
  height = 320,
  onEvents,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (...args: unknown[]) => void>;
}) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
      notMerge
      lazyUpdate
    />
  );
}
