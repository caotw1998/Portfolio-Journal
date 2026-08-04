"use client";

import type { EChartsOption, EChartsType, MarkAreaComponentOption } from "echarts";
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChartRangeControls } from "@/components/chart-range-controls";
import { ThemedEChart } from "@/components/charts/themed-echart";
import { buildPaddedValueAxisDomain } from "@/lib/chart-axis-domain";
import { searchLibraryOptions } from "@/lib/funds/library-search";
import {
  A_SHARE_MARKET_CYCLE_OPTIONS,
  formatAxisDateLabel,
  formatEdgeAxisDateLabel,
  resolveFixedRange,
  resolveFixedStartRange,
  resolvePresetRange,
  type ChartDateRange,
  type ChartRangePreset,
} from "@/lib/chart-time-range";
import {
  buildComparisonReturnSeries,
  buildDrawdownSeries,
  buildFundReturnSeries,
  buildManagerChangeMarkers,
  calculateAnnualizedReturn,
  calculateMarketCyclePerformance,
  calculateDrawdownRecovery,
  calculateSelectedRangeMetrics,
  filterFundNavPoints,
  resolveCurrentManagerStartDate,
  restrictComparisonSeriesToRange,
  snapChartDate,
  type ComparisonReturnSeries,
  type ComparisonSeriesInput,
  type FundManagerTenureInput,
  type FundNavChartPoint,
  type ManagerChangeMarker,
} from "@/lib/funds/chart-range";
import { drawdownToneClass, returnToneClass, visualToneColors } from "@/lib/visual-tones";

const chartPalette = {
  background: "#f4efe6",
  foreground: "#1f2520",
  mutedForeground: "#5e675d",
  border: "#d7c8af",
  managerChange: "#b42318",
  dividend: "#b7791f",
};

type ChartView = "performance" | "drawdown" | "marketCycles";

export type DetailBaselineOption = {
  id: string;
  kind: "fund" | "benchmark";
  name: string;
  code: string;
  market: string;
  dataBasisLabel: string | null;
};

type BenchmarkSearchCandidate = {
  code: string;
  name: string;
  market: "CN" | "SH" | "SZ" | "HK" | "GLOBAL";
  source: "csindex" | "eastmoney" | "yahoo" | "spglobal";
  sourceSymbol: string;
};

type ComparisonResponse = {
  range: ChartDateRange | null;
  series: ComparisonSeriesInput[];
  warnings: string[];
};

type VisibleManagerMarker = ManagerChangeMarker & { returnRate: number };

function ChartViewSwitch({ value, onChange, className, testId }: {
  value: ChartView;
  onChange: (view: ChartView) => void;
  className: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} role="group" aria-label="图表视图" className={className}>
      {(["performance", "drawdown", "marketCycles"] as const).map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          className={value === view
            ? "min-h-10 flex-1 bg-foreground px-4 py-2 text-xs text-background"
            : "min-h-10 flex-1 bg-background px-4 py-2 text-xs text-muted-foreground"}
        >
          {view === "performance" ? "业绩曲线" : view === "drawdown" ? "回撤曲线" : "牛熊业绩"}
        </button>
      ))}
    </div>
  );
}

const StableFundChart = memo(function StableFundChart({ option, onClick, onAxisPointer, onChartReady }: {
  option: EChartsOption;
  revision: string;
  onClick: (parameters: unknown) => void;
  onAxisPointer: (parameters: unknown) => void;
  onChartReady: (instance: EChartsType) => void;
}) {
  return <ThemedEChart option={option} height={350} onEvents={{ click: onClick, updateAxisPointer: onAxisPointer }} onChartReady={onChartReady} />;
}, (previous, next) => previous.revision === next.revision);

function formatReturn(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function basisLabel(basis: ComparisonReturnSeries["basis"]) {
  if (basis === "dividend_reinvested") return "分红再投资复权";
  if (basis === "accumulated_nav") return "累计净值";
  if (basis === "unit_nav") return "单位净值";
  return "指数点位";
}

export function DetailPerformanceChart({
  primaryId,
  primaryKind,
  primaryName,
  primaryMarket,
  points,
  managerTenures,
  baselines,
  chartSingleColor = visualToneColors.chartSingle,
  chartSeriesColors = [...visualToneColors.chartBenchmark],
}: {
  primaryId: string;
  primaryKind: "fund" | "benchmark";
  primaryName: string;
  primaryMarket: string;
  points: FundNavChartPoint[];
  managerTenures: FundManagerTenureInput[];
  baselines: DetailBaselineOption[];
  chartSingleColor?: string;
  chartSeriesColors?: string[];
}) {
  const orderedPoints = useMemo(
    () => [...points].sort((left, right) => left.date.localeCompare(right.date)),
    [points],
  );
  const availableRange = orderedPoints.length
    ? { from: orderedPoints[0]!.date, to: orderedPoints.at(-1)!.date }
    : null;
  const [preset, setPreset] = useState<ChartRangePreset>("inception");
  const [customFrom, setCustomFrom] = useState(availableRange?.from ?? "");
  const [customTo, setCustomTo] = useState(availableRange?.to ?? "");
  const [requestedRange, setRequestedRange] = useState<ChartDateRange | null>(null);
  const [selectedMarketCycleId, setSelectedMarketCycleId] = useState<string | null>(null);
  const [isCurrentManagerRangeSelected, setIsCurrentManagerRangeSelected] = useState(false);
  const [rangeMessage, setRangeMessage] = useState<string | null>(null);
  const [selectedBaselineKey, setSelectedBaselineKey] = useState("");
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [comparisonMessage, setComparisonMessage] = useState<string | null>(null);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isBenchmarkMenuOpen, setIsBenchmarkMenuOpen] = useState(false);
  const [benchmarkQuery, setBenchmarkQuery] = useState("");
  const [availableBenchmarks, setAvailableBenchmarks] = useState<DetailBaselineOption[]>(() => baselines);
  const [publicBenchmarkResults, setPublicBenchmarkResults] = useState<BenchmarkSearchCandidate[]>([]);
  const [benchmarkSearchMessage, setBenchmarkSearchMessage] = useState<string | null>(null);
  const [isSearchingBenchmarks, setIsSearchingBenchmarks] = useState(false);
  const [addingBenchmarkSymbol, setAddingBenchmarkSymbol] = useState<string | null>(null);
  const [selectedManagerMarkerDate, setSelectedManagerMarkerDate] = useState<string | null>(null);
  const [selectedDividendMarkerDate, setSelectedDividendMarkerDate] = useState<string | null>(null);
  const [highlightedSeriesName, setHighlightedSeriesName] = useState<string | null>(null);
  const [chartView, setChartView] = useState<ChartView>("performance");
  const [showManagerMarkers, setShowManagerMarkers] = useState(true);
  const [showDividendMarkers, setShowDividendMarkers] = useState(false);
  const [activePointDate, setActivePointDate] = useState<string | null>(null);
  const [selectedTouchRange, setSelectedTouchRange] = useState<ChartDateRange | null>(null);
  const benchmarkMenuRef = useRef<HTMLDivElement>(null);
  const managerCardRef = useRef<HTMLElement>(null);
  const chartInstanceRef = useRef<EChartsType | null>(null);
  const activeTouchDatesRef = useRef(new Map<number, string>());
  const currentManagerStartDate = useMemo(
    () => resolveCurrentManagerStartDate(managerTenures),
    [managerTenures],
  );

  const visiblePoints = useMemo(
    () => filterFundNavPoints(orderedPoints, requestedRange),
    [orderedPoints, requestedRange],
  );
  const fundReturnSeries = useMemo(() => buildFundReturnSeries(visiblePoints), [visiblePoints]);
  const comparisonSeries = useMemo(
    () => buildComparisonReturnSeries(comparison?.series ?? []),
    [comparison],
  );
  const restrictedComparison = useMemo(
    () => restrictComparisonSeriesToRange(comparisonSeries, requestedRange),
    [comparisonSeries, requestedRange],
  );
  const selectedBenchmark = availableBenchmarks.find((item) => `${item.kind}:${item.id}` === selectedBaselineKey);
  const matchedBenchmarks = useMemo(
    () => benchmarkQuery.trim()
      ? searchLibraryOptions(availableBenchmarks, benchmarkQuery, new Set(selectedBenchmark?.id ? [selectedBenchmark.id] : []))
      : availableBenchmarks.filter((item) => item.id !== selectedBenchmark?.id).slice(0, 8),
    [availableBenchmarks, benchmarkQuery, selectedBenchmark],
  );
  const unmatchedPublicBenchmarks = useMemo(() => publicBenchmarkResults.filter((candidate) => !availableBenchmarks.some((benchmark) => {
    const chinaMarkets = new Set(["CN", "SH", "SZ"]);
    return benchmark.code === candidate.code
      && (benchmark.market === candidate.market || chinaMarkets.has(benchmark.market) && chinaMarkets.has(candidate.market));
  })), [availableBenchmarks, publicBenchmarkResults]);
  const hasComparison = restrictedComparison.series.length === 2;
  const displayedSeries = hasComparison ? restrictedComparison.series : [
    {
      id: primaryId,
      kind: primaryKind,
      name: primaryName,
      code: "",
      basis: primaryKind === "fund" ? fundReturnSeries.basis : "close" as const,
      points: fundReturnSeries.points.map((point) => ({
        date: point.date,
        value: point.value,
        returnRate: point.returnRate,
      })),
    },
  ];
  const fundSeries = displayedSeries[0];
  const benchmarkSeries = displayedSeries[1];
  const fundLatestReturn = fundSeries?.points.at(-1)?.returnRate;
  const benchmarkLatestReturn = benchmarkSeries?.points.at(-1)?.returnRate;
  const fundAnnualizedReturn = calculateAnnualizedReturn(fundSeries?.points ?? []);
  const benchmarkAnnualizedReturn = calculateAnnualizedReturn(benchmarkSeries?.points ?? []);
  const drawdownRecovery = calculateDrawdownRecovery(fundSeries?.points ?? []);
  const drawdownSeries = displayedSeries.map((series) => ({
    ...series,
    points: buildDrawdownSeries(series.points),
  }));
  const excessReturn = fundLatestReturn !== undefined && benchmarkLatestReturn !== undefined
    ? fundLatestReturn - benchmarkLatestReturn
    : null;
  const chartDates = displayedSeries[0]?.points.map((point) => point.date) ?? [];
  const selectedRangeMetrics = selectedTouchRange
    ? calculateSelectedRangeMetrics(displayedSeries, selectedTouchRange.from, selectedTouchRange.to)
    : null;
  const displayedPointDate = activePointDate && chartDates.includes(activePointDate)
    ? activePointDate
    : chartDates.at(-1) ?? null;
  const pointDisplaySeries = chartView === "drawdown" ? drawdownSeries : displayedSeries;
  const displayedPointSeries = pointDisplaySeries.flatMap((series) => {
    const point = series.points.find((item) => item.date === displayedPointDate);
    return point ? [{ series, point }] : [];
  });
  const visibleRange = hasComparison
    ? restrictedComparison.range
    : chartDates.length
      ? { from: chartDates[0]!, to: chartDates.at(-1)! }
      : null;
  const comparisonCoverageMessage = selectedBenchmark && comparisonSeries.length === 2 && !hasComparison
    ? "所选时间与基准没有至少两个共同观测点，当前仅展示主标的。"
    : restrictedComparison.clamped && restrictedComparison.range
      ? `基准覆盖不足，已自动收窄到共同区间 ${restrictedComparison.range.from} 至 ${restrictedComparison.range.to}。`
      : null;
  const managerChangeMarkers = useMemo(
    () => buildManagerChangeMarkers(managerTenures, fundReturnSeries.points),
    [fundReturnSeries.points, managerTenures],
  );
  const visibleManagerMarkers: VisibleManagerMarker[] = managerChangeMarkers.flatMap((marker) => {
    if (hasComparison && visibleRange
      && (marker.valuationDate < visibleRange.from || marker.valuationDate > visibleRange.to)) {
      return [];
    }
    const point = fundSeries?.points.find((item) => item.date === marker.valuationDate);
    return point ? [{ ...marker, returnRate: point.returnRate }] : [];
  });
  const selectedManagerMarker = visibleManagerMarkers.find(
    (marker) => marker.valuationDate === selectedManagerMarkerDate,
  );
  const visibleDividendMarkers = fundReturnSeries.points.flatMap((point) => {
    if (!point.dividendAmount || point.dividendAmount <= 0) return [];
    if (hasComparison && visibleRange
      && (point.date < visibleRange.from || point.date > visibleRange.to)) return [];
    const displayedPoint = fundSeries?.points.find((item) => item.date === point.date);
    return displayedPoint ? [{ date: point.date, amount: point.dividendAmount, unitNav: point.unitNav, returnRate: displayedPoint.returnRate }] : [];
  });
  const selectedDividendMarker = visibleDividendMarkers.find((marker) => marker.date === selectedDividendMarkerDate);
  const activeManagerMarker = visibleManagerMarkers.find((marker) => marker.valuationDate === displayedPointDate);
  const activeDividendMarker = visibleDividendMarkers.find((marker) => marker.date === displayedPointDate);
  const seriesColor = (index: number) => displayedSeries.length === 1
    ? chartSingleColor
    : chartSeriesColors[index % chartSeriesColors.length] ?? visualToneColors.chartBenchmark[index % visualToneColors.chartBenchmark.length]!;

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (!benchmarkMenuRef.current?.contains(event.target as Node)) {
        setIsBenchmarkMenuOpen(false);
      }
      if (!managerCardRef.current?.contains(event.target as Node)) {
        setSelectedManagerMarkerDate(null);
        setSelectedDividendMarkerDate(null);
      }
    }

    function closeMenuWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsBenchmarkMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenuWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenuWithEscape);
    };
  }, []);

  useEffect(() => {
    const query = benchmarkQuery.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearchingBenchmarks(true);
      setBenchmarkSearchMessage(null);
      fetch(`/api/benchmarks/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as { data?: BenchmarkSearchCandidate[]; error?: string };
          if (!response.ok) throw new Error(body.error ?? "搜索公开指数失败。");
          setPublicBenchmarkResults(body.data ?? []);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setPublicBenchmarkResults([]);
          setBenchmarkSearchMessage(error instanceof Error ? error.message : "搜索公开指数失败。");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingBenchmarks(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [benchmarkQuery]);

  useEffect(() => {
    if (!selectedBenchmark) return;

    const controller = new AbortController();
    const parameters = new URLSearchParams({
      primaryKind,
      primaryId,
      baselineKind: selectedBenchmark.kind,
      baselineId: selectedBenchmark.id,
    });
    fetch(`/api/research/detail-compare?${parameters.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as ComparisonResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "基准加载失败。");
        setComparison(body);
        setComparisonMessage(body.warnings.length ? body.warnings.join(" ") : null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setComparison(null);
        setComparisonMessage(error instanceof Error ? error.message : "基准加载失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingComparison(false);
      });

    return () => controller.abort();
  }, [primaryId, primaryKind, selectedBenchmark]);

  function applyPreset(nextPreset: ChartRangePreset) {
    resetChartInspection();
    setRangeMessage(null);
    setPreset(nextPreset);
    setSelectedMarketCycleId(null);
    setIsCurrentManagerRangeSelected(false);
    setSelectedManagerMarkerDate(null);
    if (!availableRange || nextPreset === "inception") {
      setRequestedRange(null);
      return;
    }
    if (nextPreset === "custom") {
      setCustomFrom(availableRange.from);
      setCustomTo(availableRange.to);
      return;
    }
    setRequestedRange(resolvePresetRange(nextPreset, availableRange));
  }

  function applyCustomRange() {
    setRangeMessage(null);
    if (!customFrom || !customTo) {
      setRangeMessage("请完整填写自定义时间区间。");
      return;
    }
    if (customFrom > customTo) {
      setRangeMessage("自定义起始日期不能晚于结束日期。");
      return;
    }
    resetChartInspection();
    setSelectedManagerMarkerDate(null);
    setRequestedRange({ from: customFrom, to: customTo });
  }

  function applyMarketCycle(cycleId: string) {
    if (!availableRange) return;
    const cycle = A_SHARE_MARKET_CYCLE_OPTIONS.find((item) => item.id === cycleId);
    if (!cycle) return;
    resetChartInspection();
    const resolved = resolveFixedRange(cycle, availableRange);
    setPreset("3y");
    setSelectedMarketCycleId(cycleId);
    setIsCurrentManagerRangeSelected(false);
    setSelectedManagerMarkerDate(null);
    setRangeMessage(resolved.clampedFrom || resolved.clampedTo
      ? `${cycle.label}超出主标的数据范围，已采用 ${resolved.range.from} 至 ${resolved.range.to}。`
      : `${cycle.label} · A股研究口径 ${cycle.from} 至 ${cycle.to ?? "最新可用日期"}`);
    setRequestedRange(resolved.range);
  }

  function applyCurrentManagerRange() {
    if (!availableRange || !currentManagerStartDate) return;
    resetChartInspection();
    const resolved = resolveFixedStartRange(currentManagerStartDate, availableRange);
    setPreset("3y");
    setSelectedMarketCycleId(null);
    setIsCurrentManagerRangeSelected(true);
    setSelectedManagerMarkerDate(null);
    setRangeMessage(resolved.clampedToAvailableStart
      ? "现任经理任职日早于基金净值历史，已从首个净值日开始。"
      : null);
    setRequestedRange(resolved.range);
  }

  function selectBenchmark(baselineKey: string) {
    resetChartInspection();
    setComparison(null);
    setComparisonMessage(null);
    setIsLoadingComparison(Boolean(baselineKey));
    setSelectedBaselineKey(baselineKey);
    setSelectedManagerMarkerDate(null);
    setIsBenchmarkMenuOpen(false);
    setBenchmarkQuery("");
    setPublicBenchmarkResults([]);
    setBenchmarkSearchMessage(null);
    setIsSearchingBenchmarks(false);
  }

  function updateBenchmarkQuery(value: string) {
    setBenchmarkQuery(value);
    if (value.trim().length >= 2) return;
    setPublicBenchmarkResults([]);
    setBenchmarkSearchMessage(null);
    setIsSearchingBenchmarks(false);
  }

  async function addPublicBenchmark(candidate: BenchmarkSearchCandidate) {
    setAddingBenchmarkSymbol(candidate.sourceSymbol);
    setBenchmarkSearchMessage("正在加入指数库并同步历史数据……");
    try {
      const createResponse = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      });
      const createBody = await createResponse.json() as { data?: { id?: string }; error?: string };
      if (!createResponse.ok || !createBody.data?.id) throw new Error(createBody.error ?? "加入指数库失败。");
      const benchmarkId = createBody.data.id;
      const syncResponse = await fetch(`/api/benchmarks/${benchmarkId}/sync`, { method: "POST" });
      const syncBody = await syncResponse.json() as { error?: string };
      if (!syncResponse.ok) {
        throw new Error(`指数已录入，但暂无可靠历史：${syncBody.error ?? "首轮同步失败。"}`);
      }
      const listResponse = await fetch("/api/benchmarks");
      const listBody = await listResponse.json() as { data?: Array<Omit<DetailBaselineOption, "kind">> };
      const listed = listBody.data?.find((item) => item.id === benchmarkId);
      const added: DetailBaselineOption = listed
        ? { ...listed, kind: "benchmark" }
        : { id: benchmarkId, kind: "benchmark", name: candidate.name, code: candidate.code, market: candidate.market, dataBasisLabel: null };
      setAvailableBenchmarks((current) => [...current, added]);
      selectBenchmark(`benchmark:${benchmarkId}`);
    } catch (error) {
      setBenchmarkSearchMessage(error instanceof Error ? error.message : "加入并同步指数失败。");
    } finally {
      setAddingBenchmarkSymbol(null);
    }
  }

  function handleChartClick(parameters: unknown) {
    setSelectedTouchRange(null);
    if (!parameters || typeof parameters !== "object") return;
    const event = parameters as { seriesName?: unknown; data?: unknown };
    if (!Array.isArray(event.data)) return;
    const valuationDate = event.data[0];
    if (typeof valuationDate !== "string") return;
    if (event.seriesName === "基金经理更换") {
      setSelectedDividendMarkerDate(null);
      setSelectedManagerMarkerDate(valuationDate);
    }
    if (event.seriesName === "基金分红") {
      setSelectedManagerMarkerDate(null);
      setSelectedDividendMarkerDate(valuationDate);
    }
  }

  function handleAxisPointer(parameters: unknown) {
    if (!parameters || typeof parameters !== "object") return;
    const axesInfo = (parameters as { axesInfo?: Array<{ value?: unknown }> }).axesInfo;
    const value = axesInfo?.[0]?.value;
    const date = typeof value === "string" && chartDates.includes(value)
      ? value
      : typeof value === "number"
        ? snapChartDate(chartDates, value)
        : null;
    if (date) setActivePointDate(date);
  }

  function chartDateAtPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const instance = chartInstanceRef.current;
    if (!instance || !chartDates.length) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const converted = instance.convertFromPixel({ xAxisIndex: 0 }, localX);
    if (typeof converted === "string" && chartDates.includes(converted)) return converted;
    if (typeof converted === "number") return snapChartDate(chartDates, converted);
    if (Array.isArray(converted)) {
      const xValue = converted[0];
      if (typeof xValue === "string" && chartDates.includes(xValue)) return xValue;
      if (typeof xValue === "number") return snapChartDate(chartDates, xValue);
    }
    return null;
  }

  function updateTouchSelection() {
    const touchDates = Array.from(activeTouchDatesRef.current.values());
    if (touchDates.length < 2) return;
    const [firstDate, secondDate] = touchDates;
    if (!firstDate || !secondDate) return;
    const [from, to] = firstDate <= secondDate
      ? [firstDate, secondDate]
      : [secondDate, firstDate];
    setSelectedTouchRange({ from, to });
  }

  function handleChartPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    const date = chartDateAtPointer(event);
    if (!date) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by browser tests do not register a native active pointer.
    }
    activeTouchDatesRef.current.set(event.pointerId, date);
    setActivePointDate(date);
    if (activeTouchDatesRef.current.size === 1) setSelectedTouchRange(null);
    updateTouchSelection();
  }

  function handleChartPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !activeTouchDatesRef.current.has(event.pointerId)) return;
    const date = chartDateAtPointer(event);
    if (!date) return;
    activeTouchDatesRef.current.set(event.pointerId, date);
    if (activeTouchDatesRef.current.size === 1) setActivePointDate(date);
    updateTouchSelection();
  }

  function handleChartPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    activeTouchDatesRef.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may already have released a cancelled touch pointer.
    }
  }

  function clearTouchRange() {
    activeTouchDatesRef.current.clear();
    setSelectedTouchRange(null);
  }

  function resetChartInspection() {
    activeTouchDatesRef.current.clear();
    setSelectedTouchRange(null);
    setActivePointDate(null);
  }

  function changeChartView(view: ChartView) {
    setChartView(view);
    setSelectedManagerMarkerDate(null);
    setSelectedDividendMarkerDate(null);
  }

  const plottedSeries = chartView === "drawdown" ? drawdownSeries : displayedSeries;
  const marketCycleMetrics = chartView === "marketCycles"
    ? calculateMarketCyclePerformance(displayedSeries, A_SHARE_MARKET_CYCLE_OPTIONS)
    : [];
  const axisDomain = buildPaddedValueAxisDomain(
    plottedSeries.flatMap((series) => series.points.map((point) => (
      "drawdown" in point ? point.drawdown * 100 : point.returnRate * 100
    ))),
    { includeZero: true, minSpan: 4 },
  );
  const selectedRangeMarkArea: MarkAreaComponentOption | undefined = selectedTouchRange ? {
    silent: true,
    itemStyle: { opacity: 0.08 },
    data: [[
      { xAxis: selectedTouchRange.from },
      { xAxis: selectedTouchRange.to },
    ]],
  } : undefined;
  const marketCycleMarkAreaData = marketCycleMetrics.map((cycle) => ([
    {
      xAxis: cycle.from,
      name: `${cycle.kind === "bull" ? "牛市" : cycle.kind === "bear" ? "熊市" : "行情"}\n年化 ${formatReturn(cycle.primaryAnnualizedReturn)}${cycle.annualizedExcessReturn === null ? "" : `\n超额 ${formatReturn(cycle.annualizedExcessReturn)}`}`,
      itemStyle: { color: cycle.kind === "bull" ? "rgba(180, 35, 24, 0.08)" : cycle.kind === "bear" ? "rgba(39, 108, 155, 0.09)" : "rgba(183, 121, 31, 0.08)" },
      label: { show: true, position: "insideTop", color: chartPalette.mutedForeground, fontSize: 10, lineHeight: 14 },
    },
    { xAxis: cycle.to },
  ]));
  const option: EChartsOption = {
    animation: false,
    grid: { left: 0, right: 38, top: 24, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      showContent: false,
      axisPointer: { type: "line", snap: true },
      backgroundColor: chartPalette.background,
      borderColor: chartPalette.border,
      textStyle: { color: chartPalette.foreground },
      formatter: (parameters) => {
        const entries = Array.isArray(parameters) ? parameters : [parameters];
        const first = entries[0] as (typeof entries)[number] & { axisValue?: unknown };
        const date = typeof first?.axisValue === "string" ? first.axisValue : "";
        const lines = [`<div style="margin-bottom:4px;font-weight:600">${escapeHtml(date)}</div>`];
        for (const entry of entries) {
          const data = Array.isArray(entry.data) ? entry.data : [];
          if (entry.seriesName === "基金经理更换") {
            const marker = visibleManagerMarkers.find((item) => item.valuationDate === data[0]);
            if (marker) {
              for (const change of marker.changes) {
                lines.push(`<div><span style="display:inline-block;margin-right:6px;border-radius:50%;width:8px;height:8px;background:${chartPalette.managerChange}"></span>经理更换 ${escapeHtml(change.date)} · 新任 ${change.managerNames.map(escapeHtml).join("、")}</div>`);
              }
            }
            continue;
          }
          if (entry.seriesName === "基金分红") {
            const dividend = visibleDividendMarkers.find((item) => item.date === data[0]);
            if (dividend) lines.push(`<div><span style="display:inline-block;margin-right:6px;width:8px;height:8px;transform:rotate(45deg);background:${chartPalette.dividend}"></span>基金分红 · 每份 ${dividend.amount.toFixed(5)} 元 · 除息净值 ${dividend.unitNav.toFixed(4)}</div>`);
            continue;
          }
          const percent = typeof data[1] === "number" ? data[1] : null;
          const rawValue = typeof data[2] === "number" ? data[2] : null;
          const currentSeries = displayedSeries.find((series) => series.name === entry.seriesName);
          const marker = typeof entry.marker === "string" ? entry.marker : "";
          const tone = percent === null || percent === 0 ? visualToneColors.neutral : percent > 0 ? visualToneColors.gain : visualToneColors.loss;
          const metricLabel = chartView === "drawdown" ? "当前回撤" : "相对起点";
          lines.push(`<div>${marker}${escapeHtml(String(entry.seriesName ?? ""))} ${metricLabel} <strong style="color:${tone}">${percent === null ? "--" : `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`}</strong>${rawValue === null || !currentSeries ? "" : ` · ${basisLabel(currentSeries.basis)} ${rawValue.toFixed(currentSeries.kind === "fund" ? 4 : 2)}`}</div>`);
        }
        return lines.join("");
      },
    },
    legend: {
      show: false,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: chartDates,
      axisLabel: {
        color: chartPalette.mutedForeground,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        interval: (index: number) => index === 0
          || index === chartDates.length - 1
          || index % Math.max(Math.ceil(chartDates.length / 10), 1) === 0,
        formatter: (value: string, index: number) => index === 0 || index === chartDates.length - 1
          ? formatEdgeAxisDateLabel(value)
          : formatAxisDateLabel(value, index, chartDates),
      },
      axisLine: { lineStyle: { color: chartPalette.border } },
    },
    yAxis: {
      type: "value",
      min: axisDomain.min,
      max: axisDomain.max,
      axisLabel: { color: chartPalette.mutedForeground, formatter: (value: number) => `${value.toFixed(0)}%` },
      splitLine: { lineStyle: { color: chartPalette.border, opacity: 0.45 } },
    },
    series: [
      ...plottedSeries.map((series, seriesIndex) => {
      const isBaseline = seriesIndex === 1;
      const color = seriesColor(seriesIndex);
      const latestPoint = series.points.at(-1);
      return {
        name: series.name,
        type: "line" as const,
        showSymbol: true,
        smooth: 0.14,
        symbol: "circle",
        symbolSize: (value: unknown) => Array.isArray(value) && value[0] === latestPoint?.date ? 10 : 0,
        lineStyle: { width: highlightedSeriesName === series.name ? 3 : isBaseline ? 1.5 : 2, type: isBaseline ? "dashed" as const : "solid" as const, color },
        itemStyle: { color, borderColor: chartPalette.background, borderWidth: 2 },
        areaStyle: !hasComparison && !isBaseline ? { color, opacity: chartView === "drawdown" ? 0.12 : 0.08 } : undefined,
        endLabel: { show: false },
        labelLayout: { moveOverlap: "shiftY" as const },
        markLine: !isBaseline ? {
          silent: true,
          symbol: "none",
          lineStyle: { color: chartPalette.border },
          data: [
            { yAxis: 0 },
            ...(selectedTouchRange ? [
              { xAxis: selectedTouchRange.from, lineStyle: { color: chartPalette.foreground, width: 1, type: "dashed" as const } },
              { xAxis: selectedTouchRange.to, lineStyle: { color: chartPalette.foreground, width: 1, type: "dashed" as const } },
            ] : []),
          ],
        } : undefined,
        markArea: seriesIndex === 0 && chartView === "marketCycles" && marketCycleMarkAreaData.length
          ? { silent: true, data: marketCycleMarkAreaData as NonNullable<MarkAreaComponentOption["data"]> }
          : seriesIndex === 0 && selectedRangeMarkArea
            ? { ...selectedRangeMarkArea, itemStyle: { color, opacity: 0.08 } }
            : undefined,
        data: series.points.map((point) => [point.date, ("drawdown" in point ? point.drawdown : point.returnRate) * 100, point.value]),
      };
      }),
      ...(chartView === "performance" && showManagerMarkers && visibleManagerMarkers.length ? [{
        name: "基金经理更换",
        type: "scatter" as const,
        symbol: "circle",
        symbolSize: 18,
        z: 20,
        itemStyle: {
          color: chartPalette.managerChange,
          borderColor: chartPalette.background,
          borderWidth: 2,
        },
        emphasis: { scale: 1.35 },
        data: visibleManagerMarkers.map((marker) => [
          marker.valuationDate,
          marker.returnRate * 100,
        ]),
      }] : []),
      ...(chartView === "performance" && showDividendMarkers && visibleDividendMarkers.length ? [{
        name: "基金分红",
        type: "scatter" as const,
        symbol: "diamond",
        symbolSize: 17,
        z: 21,
        itemStyle: { color: chartPalette.dividend, borderColor: chartPalette.background, borderWidth: 2 },
        emphasis: { scale: 1.35 },
        data: visibleDividendMarkers.map((marker) => [marker.date, marker.returnRate * 100]),
      }] : []),
    ],
  };
  const chartRevision = [
    visibleRange?.from,
    visibleRange?.to,
    ...displayedSeries.map((series) => `${series.id}:${series.points.length}:${series.points.at(-1)?.value ?? ""}`),
    ...visibleManagerMarkers.map((marker) => `m:${marker.valuationDate}`),
    ...visibleDividendMarkers.map((marker) => `d:${marker.date}:${marker.amount}`),
    `highlight:${highlightedSeriesName ?? ""}`,
    `view:${chartView}`,
    `manager:${showManagerMarkers}`,
    `dividend:${showDividendMarkers}`,
    `touch:${selectedTouchRange?.from ?? ""}:${selectedTouchRange?.to ?? ""}`,
    `colors:${chartSingleColor}:${chartSeriesColors.join(",")}`,
  ].join("|");
  const statusMessages = [rangeMessage, comparisonMessage, comparisonCoverageMessage]
    .filter((message): message is string => Boolean(message));

  return (
    <div>
      {primaryKind === "benchmark" ? (
        <div className="border-b border-border pb-3">
          <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
            {visibleRange
              ? `${visibleRange.from} 至 ${visibleRange.to} · ${chartDates.length} 个观测点`
              : "所选区间暂无可比较数据"}
          </p>
        </div>
      ) : null}

      {statusMessages.length ? (
        <p className="mt-3 border-l-2 border-[var(--warm-highlight)] pl-3 text-sm text-red-700" aria-live="polite">
          {statusMessages.join(" ")}
        </p>
      ) : null}

      {displayedSeries[0]?.points.length ? (
        <div className="relative">
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <ChartViewSwitch value={chartView} onChange={changeChartView} testId="mobile-chart-view-switch" className="flex gap-px bg-border p-px" />
            <div aria-label="曲线标签" className="flex flex-wrap gap-2">
            {displayedSeries.map((series, seriesIndex) => {
              const color = seriesColor(seriesIndex);
              const highlighted = highlightedSeriesName === series.name;
              return <button key={series.id} type="button" aria-pressed={highlighted} onClick={() => setHighlightedSeriesName((current) => current === series.name ? null : series.name)} className={highlighted ? "min-h-10 border border-foreground bg-background px-3 py-1.5 text-xs font-bold" : "min-h-10 border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"}><span className="mr-2 inline-block h-0.5 w-5 align-middle" style={{ backgroundColor: color }} />{series.name}</button>;
            })}
            {visibleManagerMarkers.length ? <button data-testid="manager-change-legend" type="button" aria-pressed={showManagerMarkers} onClick={() => { setShowManagerMarkers((current) => !current); setSelectedManagerMarkerDate(null); }} className={showManagerMarkers ? "min-h-10 border border-[#b42318] bg-background px-3 py-1.5 text-xs font-medium" : "min-h-10 border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground opacity-60"}><span className="mr-2 inline-block size-2.5 rounded-full bg-[#b42318] align-middle" />经理更换</button> : null}
            {visibleDividendMarkers.length ? <button data-testid="dividend-legend" type="button" aria-pressed={showDividendMarkers} onClick={() => { setShowDividendMarkers((current) => !current); setSelectedDividendMarkerDate(null); }} className={showDividendMarkers ? "min-h-10 border border-[#b7791f] bg-background px-3 py-1.5 text-xs font-medium" : "min-h-10 border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground opacity-60"}><span className="mr-2 inline-block size-2.5 rotate-45 bg-[#b7791f] align-middle" />基金分红</button> : null}
            </div>
          </div>
          {fundSeries?.points.length && chartDates.length >= 2 ? (
            <div data-testid="visible-range-performance-summary" className="mt-2 text-sm" aria-live="polite">
              <div className="text-[11px] text-muted-foreground"><p>{visibleRange?.to} 相对起点</p></div>
              <div data-testid="fund-visible-metric-grid" data-mobile-grid-columns="3" className={`mt-1 grid grid-cols-3 gap-px border border-border bg-border ${benchmarkSeries ? "lg:grid-cols-6 layout-mobile:grid-cols-3 layout-desktop:grid-cols-6" : ""}`}>
                <p className="min-w-0 bg-background px-1.5 py-1"><span className="block truncate text-[9px] leading-4 text-muted-foreground">{preset === "inception" ? "成立来收益" : "区间收益"}</span><strong className={`block text-sm leading-5 ${returnToneClass(fundLatestReturn ?? 0)}`}>{formatReturn(fundLatestReturn)}</strong></p>
                <p className="min-w-0 bg-background px-1.5 py-1"><span className="block truncate text-[9px] leading-4 text-muted-foreground">年化收益</span><strong className={`block text-sm leading-5 ${returnToneClass(fundAnnualizedReturn ?? 0)}`}>{formatReturn(fundAnnualizedReturn)}</strong></p>
                <p className="min-w-0 bg-background px-1.5 py-1"><span className="block truncate text-[9px] leading-4 text-muted-foreground">最大回撤</span><strong className={`block text-sm leading-5 ${drawdownToneClass(drawdownRecovery?.maxDrawdown ?? 0)}`}>{drawdownRecovery ? formatReturn(drawdownRecovery.maxDrawdown) : "--"}</strong></p>
                {benchmarkSeries ? <p className="min-w-0 bg-background px-1.5 py-1"><span className="block truncate text-[9px] leading-4 text-muted-foreground">基准收益</span><strong className={`block text-sm leading-5 ${returnToneClass(benchmarkLatestReturn ?? 0)}`}>{formatReturn(benchmarkLatestReturn)}</strong></p> : null}
                {benchmarkSeries ? <p className="min-w-0 bg-background px-1.5 py-1"><span className="block truncate text-[9px] leading-4 text-muted-foreground">基准年化</span><strong className={`block text-sm leading-5 ${returnToneClass(benchmarkAnnualizedReturn ?? 0)}`}>{formatReturn(benchmarkAnnualizedReturn)}</strong></p> : null}
                {benchmarkSeries ? <p className="min-w-0 bg-background px-1.5 py-1"><span className="block truncate text-[9px] leading-4 text-muted-foreground">超额收益</span><strong className={`block text-sm leading-5 ${returnToneClass(excessReturn ?? 0)}`}>{formatReturn(excessReturn)}</strong></p> : null}
              </div>
            </div>
          ) : fundSeries?.points.length ? <p className="mt-2 text-xs text-muted-foreground">区间内不足两个有效点，暂不计算收益率。</p> : null}
          <div
            data-testid="fund-nav-chart-touch-area"
            className="mt-0.5 min-w-0 overflow-hidden"
            style={{ touchAction: "pan-y" }}
            onPointerDown={handleChartPointerDown}
            onPointerMove={handleChartPointerMove}
            onPointerUp={handleChartPointerEnd}
            onPointerCancel={handleChartPointerEnd}
          >
            <StableFundChart
              option={option}
              revision={chartRevision}
              onClick={handleChartClick}
              onAxisPointer={handleAxisPointer}
              onChartReady={(instance) => { chartInstanceRef.current = instance; }}
            />
          </div>
          <div data-testid="fund-chart-range-controls-row" className="mt-1 flex min-w-0 flex-wrap items-start gap-1">
            <div className="min-w-0 flex-1 basis-[12rem]">
              <ChartRangeControls
                testId="fund-chart-range-controls"
                preset={preset}
                customFrom={customFrom}
                customTo={customTo}
                disabled={!availableRange}
                marketCycleOptions={primaryKind === "fund" || ["CN", "SH", "SZ"].includes(primaryMarket) ? A_SHARE_MARKET_CYCLE_OPTIONS : []}
                selectedMarketCycleId={selectedMarketCycleId}
                currentManagerStartDate={currentManagerStartDate}
                isCurrentManagerRangeSelected={isCurrentManagerRangeSelected}
                onPresetChange={applyPreset}
                onMarketCycleChange={applyMarketCycle}
                onCurrentManagerRangeChange={applyCurrentManagerRange}
                onCustomFromChange={setCustomFrom}
                onCustomToChange={setCustomTo}
                onApplyCustom={applyCustomRange}
              />
            </div>
            <div ref={benchmarkMenuRef} data-testid="fund-benchmark-control" className="relative min-w-0 max-w-[45%]">
              <button
                type="button"
                aria-label={selectedBenchmark ? `基准：${selectedBenchmark.name}` : "添加基准"}
                aria-expanded={isBenchmarkMenuOpen}
                aria-haspopup="dialog"
                onClick={() => setIsBenchmarkMenuOpen((open) => !open)}
                className="flex h-8 max-w-full items-center border border-[var(--warm-highlight)] bg-background px-2.5 text-left text-[11px] font-medium text-foreground"
              >
                <span className="truncate">{isLoadingComparison ? "加载基准…" : selectedBenchmark ? `基准：${selectedBenchmark.name}` : "添加基准"}</span>
                <span className="ml-1.5 shrink-0 text-muted-foreground" aria-hidden="true">⌄</span>
              </button>
              {isBenchmarkMenuOpen ? (
                <div role="dialog" aria-label="选择基准" className="fixed left-1/2 top-24 z-[60] max-h-[min(22rem,calc(100dvh-12rem))] w-[min(16rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto border border-border bg-card p-3 shadow-xl layout-desktop:absolute layout-desktop:bottom-full layout-desktop:left-auto layout-desktop:right-0 layout-desktop:top-auto layout-desktop:mb-2 layout-desktop:max-h-[min(32rem,calc(100vh-6rem))] layout-desktop:w-[min(18rem,calc(100vw-2rem))] layout-desktop:translate-x-0">
                  <label className="grid gap-1 text-xs text-muted-foreground">搜索研究库<input autoFocus aria-label="搜索基金或指数" value={benchmarkQuery} onChange={(event) => updateBenchmarkQuery(event.target.value)} placeholder="输入基金或指数名称、代码" autoComplete="off" className="border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent" /></label>
                  {selectedBenchmark ? <div className="mt-2 flex items-center justify-between gap-2 border border-accent bg-background px-3 py-2 text-sm"><span className="truncate">{selectedBenchmark.name}</span><button type="button" aria-label={`移除基准 ${selectedBenchmark.name}`} onClick={() => selectBenchmark("")} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">移除</button></div> : null}
                  <div className="mt-2 max-h-64 overflow-y-auto border border-border">
                      {matchedBenchmarks.map((benchmark) => <button key={`${benchmark.kind}:${benchmark.id}`} type="button" aria-label={`${benchmark.name} · ${benchmark.code}`} onClick={() => selectBenchmark(`${benchmark.kind}:${benchmark.id}`)} className="w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted focus:bg-muted"><span className="block text-sm font-medium">{benchmark.name}</span><span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{benchmark.kind === "fund" ? "基金" : "指数"} · {benchmark.code} · {benchmark.market}{benchmark.dataBasisLabel ? ` · ${benchmark.dataBasisLabel}` : ""}</span></button>)}
                      {unmatchedPublicBenchmarks.map((candidate) => (
                        <div key={`${candidate.source}:${candidate.sourceSymbol}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-2 last:border-0">
                          <div className="min-w-0"><p className="truncate text-sm font-medium">{candidate.name}</p><p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{candidate.code} · {candidate.market} · {candidate.source}</p></div>
                          <button type="button" onClick={() => void addPublicBenchmark(candidate)} disabled={addingBenchmarkSymbol !== null} className="min-h-9 shrink-0 border border-accent px-2 text-[11px] font-medium text-accent disabled:opacity-50">{addingBenchmarkSymbol === candidate.sourceSymbol ? "同步中…" : "加入"}</button>
                        </div>
                      ))}
                      {isSearchingBenchmarks ? <p className="px-3 py-3 text-xs text-muted-foreground">正在搜索公开指数……</p> : null}
                      {!isSearchingBenchmarks && !matchedBenchmarks.length && !unmatchedPublicBenchmarks.length ? <p className="px-3 py-4 text-sm text-muted-foreground">没有匹配的可用基金或指数。</p> : null}
                  </div>
                  {benchmarkSearchMessage ? <p className="mt-2 text-xs leading-5 text-red-700" aria-live="polite">{benchmarkSearchMessage}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
          <section data-testid="fund-performance-readout" aria-live="polite" className="border border-border bg-[color-mix(in_srgb,var(--card)_88%,var(--muted))] px-3 py-3 shadow-[inset_3px_0_0_var(--accent)]">
            {selectedTouchRange ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">双指区间</p><p className="mt-1 font-mono text-xs font-semibold">{selectedTouchRange.from} → {selectedTouchRange.to}</p></div>
                  <button type="button" onClick={clearTouchRange} className="min-h-9 shrink-0 border border-border bg-background px-3 text-xs text-muted-foreground">清除区间</button>
                </div>
                {selectedRangeMetrics ? (
                  <div className="mt-3">
                    <p className="text-[11px] text-muted-foreground">共 {selectedRangeMetrics.days} 个自然日</p>
                    <div className="mt-2 grid grid-cols-3 gap-px bg-border">
                      {selectedRangeMetrics.series.map((metric, index) => <div key={metric.id} className="bg-background p-2"><p className="truncate text-[10px] text-muted-foreground">{index === 0 ? "主标的" : "基准"}涨跌</p><p className={`mt-1 font-semibold ${returnToneClass(metric.returnRate)}`}>{formatReturn(metric.returnRate)}</p></div>)}
                      {selectedRangeMetrics.series[0] ? <div className="bg-background p-2"><p className="text-[10px] text-muted-foreground">主标的年化</p><p className={`mt-1 font-semibold ${returnToneClass(selectedRangeMetrics.series[0].annualizedReturn ?? 0)}`}>{formatReturn(selectedRangeMetrics.series[0].annualizedReturn)}</p></div> : null}
                      {selectedRangeMetrics.series[0] ? <div className="bg-background p-2"><p className="text-[10px] text-muted-foreground">最大回撤</p><p className={`mt-1 font-semibold ${drawdownToneClass(selectedRangeMetrics.series[0].maxDrawdown)}`}>{formatReturn(selectedRangeMetrics.series[0].maxDrawdown)}</p></div> : null}
                      {selectedRangeMetrics.excessReturn !== null ? <div className="bg-background p-2"><p className="text-[10px] text-muted-foreground">超额收益</p><p className={`mt-1 font-semibold ${returnToneClass(selectedRangeMetrics.excessReturn)}`}>{formatReturn(selectedRangeMetrics.excessReturn)}</p></div> : null}
                    </div>
                  </div>
                ) : <p className="mt-3 text-xs text-muted-foreground">两个触点位于同一交易日，请拉开距离后查看区间业绩。</p>}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3"><p className="font-mono text-xs font-semibold">{displayedPointDate ?? "暂无日期"}</p><p className="text-[10px] text-muted-foreground">单指查看 · 双指比较区间</p></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {displayedPointSeries.map(({ series, point }) => {
                    const isDrawdownPoint = "drawdown" in point;
                    const pointMetric = isDrawdownPoint ? point.drawdown : point.returnRate;
                    return <p key={series.id} data-testid="active-point-metric"><span className="text-muted-foreground">{series.name} · {isDrawdownPoint ? "当前回撤" : "相对起点"} </span><strong className={isDrawdownPoint ? drawdownToneClass(pointMetric) : returnToneClass(pointMetric)}>{formatReturn(pointMetric)}</strong><span className="text-muted-foreground"> · {basisLabel(series.basis)} {point.value.toFixed(series.kind === "fund" ? 4 : 2)}</span></p>;
                  })}
                </div>
                {activeManagerMarker ? <p className="mt-2 text-xs text-[#b42318]">经理更换 {activeManagerMarker.changes.map((change) => `${change.date} · 新任 ${change.managerNames.join("、")}`).join("；")}</p> : null}
                {activeDividendMarker ? <p className="mt-2 text-xs text-[#8a5b16]">基金分红 {activeDividendMarker.date} · 每份 {activeDividendMarker.amount.toFixed(5)} 元</p> : null}
              </>
            )}
          </section>
          {selectedManagerMarker ? (
            <aside ref={managerCardRef} data-testid="manager-change-card" className="absolute right-3 top-14 z-20 w-[min(20rem,calc(100%-1.5rem))] border border-[#b42318]/40 bg-card/98 p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-[#b42318]">基金经理更换</h3>
                <button type="button" aria-label="关闭经理更换详情" onClick={() => setSelectedManagerMarkerDate(null)} className="px-1 text-lg leading-none text-muted-foreground">×</button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">对应净值日 {selectedManagerMarker.valuationDate} · 相对区间起点 {formatReturn(selectedManagerMarker.returnRate)}</p>
              <div className="mt-3 grid gap-2">
                {selectedManagerMarker.changes.map((change) => <p key={change.date} className="text-sm"><span className="font-mono text-xs text-muted-foreground">{change.date}</span><span className="ml-2">新任 {change.managerNames.join("、")}</span></p>)}
              </div>
            </aside>
          ) : null}
          {selectedDividendMarker ? (
            <aside ref={managerCardRef} data-testid="dividend-card" className="absolute right-3 top-14 z-20 w-[min(20rem,calc(100%-1.5rem))] border border-[#b7791f]/50 bg-card/98 p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-[#8a5b16]">基金分红</h3>
                <button type="button" aria-label="关闭基金分红详情" onClick={() => setSelectedDividendMarkerDate(null)} className="px-1 text-lg leading-none text-muted-foreground">×</button>
              </div>
              <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">除息日期</dt><dd className="font-mono">{selectedDividendMarker.date}</dd>
                <dt className="text-muted-foreground">每份分红</dt><dd>{selectedDividendMarker.amount.toFixed(5)} 元</dd>
                <dt className="text-muted-foreground">当日净值</dt><dd>{selectedDividendMarker.unitNav.toFixed(4)}</dd>
              </dl>
            </aside>
          ) : null}
        </div>
      ) : (
        <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
          该时间区间内没有可展示的业绩记录。
        </div>
      )}
    </div>
  );
}
