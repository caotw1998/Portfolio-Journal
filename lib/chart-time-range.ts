export type ChartRangePreset =
  | "1m"
  | "6m"
  | "1y"
  | "3y"
  | "5y"
  | "10y"
  | "inception"
  | "custom";

export type ChartDateRange = {
  from: string;
  to: string;
};

export type MarketCycleOption = {
  id: string;
  label: string;
  kind: "bull" | "bear" | "market";
  from: string;
  to: string | null;
};

export const A_SHARE_MARKET_CYCLE_OPTIONS: MarketCycleOption[] = [
  { id: "a-share-market-2024", label: "2024 行情", kind: "market", from: "2024-09-24", to: null },
  { id: "a-share-bear-2021", label: "2021—2024 熊市", kind: "bear", from: "2021-02-18", to: "2024-09-24" },
  { id: "a-share-bull-2019", label: "2019—2021 牛市", kind: "bull", from: "2019-01-04", to: "2021-02-18" },
  { id: "a-share-bear-2015", label: "2015—2019 熊市", kind: "bear", from: "2015-06-12", to: "2019-01-04" },
  { id: "a-share-bull-2014", label: "2014—2015 牛市", kind: "bull", from: "2014-07-21", to: "2015-06-12" },
  { id: "a-share-bear-2009", label: "2009—2014 熊市", kind: "bear", from: "2009-08-04", to: "2014-07-21" },
  { id: "a-share-bull-2008", label: "2008—2009 牛市", kind: "bull", from: "2008-10-28", to: "2009-08-04" },
  { id: "a-share-bear-2007", label: "2007—2008 熊市", kind: "bear", from: "2007-10-16", to: "2008-10-28" },
  { id: "a-share-bull-2005", label: "2005—2007 牛市", kind: "bull", from: "2005-06-06", to: "2007-10-16" },
];

export const CHART_RANGE_PRESET_OPTIONS: Array<{
  id: ChartRangePreset;
  label: string;
}> = [
  { id: "1m", label: "1月" },
  { id: "6m", label: "6月" },
  { id: "1y", label: "1年" },
  { id: "3y", label: "3年" },
  { id: "5y", label: "5年" },
  { id: "10y", label: "10年" },
  { id: "inception", label: "成立来" },
  { id: "custom", label: "自定义" },
];

function parseDatePart(value: string, label: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

export function parseDateKey(dateKey: string) {
  const [yearPart, monthPart, dayPart] = dateKey.split("-");
  if (!yearPart || !monthPart || !dayPart) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return new Date(
    Date.UTC(
      parseDatePart(yearPart, "year"),
      parseDatePart(monthPart, "month") - 1,
      parseDatePart(dayPart, "day"),
    ),
  );
}

export function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  try {
    return formatDateKey(parseDateKey(dateKey)) === dateKey;
  } catch {
    return false;
  }
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dateKeyToUtcTimestamp(dateKey: string) {
  return parseDateKey(dateKey).getTime();
}

export function formatUtcTimestampDateKey(value: string | number) {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? parseDateKey(value)
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return formatDateKey(date);
}

function padMonth(month: number) {
  return String(month).padStart(2, "0");
}

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function shiftUtcMonths(date: Date, deltaMonths: number) {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth() + deltaMonths;
  const day = date.getUTCDate();
  const targetYear = year + Math.floor(monthIndex / 12);
  const normalizedMonthIndex = ((monthIndex % 12) + 12) % 12;
  const targetDay = Math.min(
    day,
    daysInUtcMonth(targetYear, normalizedMonthIndex),
  );

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonthIndex,
      targetDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

function clampDate(date: Date, earliest: Date, latest: Date) {
  if (date.getTime() < earliest.getTime()) {
    return earliest;
  }

  if (date.getTime() > latest.getTime()) {
    return latest;
  }

  return date;
}

export function resolvePresetRange(
  preset: Exclude<ChartRangePreset, "custom">,
  availableRange: ChartDateRange,
  observationDates: string[] = [],
) {
  const earliest = parseDateKey(availableRange.from);
  const latest = parseDateKey(availableRange.to);

  if (latest.getTime() < earliest.getTime()) {
    throw new Error("availableRange.from must be before availableRange.to");
  }

  if (preset === "inception") {
    return availableRange;
  }

  const deltaMonthsByPreset = {
    "1m": -1,
    "6m": -6,
    "1y": -12,
    "3y": -36,
    "5y": -60,
    "10y": -120,
  } satisfies Record<Exclude<ChartRangePreset, "custom" | "inception">, number>;

  const shiftedFrom = clampDate(
    shiftUtcMonths(latest, deltaMonthsByPreset[preset]),
    earliest,
    latest,
  );
  const targetFrom = formatDateKey(shiftedFrom);
  const observedStart = Array.from(new Set(observationDates))
    .filter((date) => date >= availableRange.from && date <= availableRange.to && date < targetFrom)
    .sort()
    .at(-1);
  const from = observedStart ?? targetFrom;

  return {
    from,
    to: formatDateKey(latest),
  };
}

export function resolveFixedStartRange(
  fixedFrom: string,
  availableRange: ChartDateRange,
) {
  const clampedToAvailableStart = fixedFrom < availableRange.from;
  const from = clampedToAvailableStart
    ? availableRange.from
    : fixedFrom > availableRange.to
      ? availableRange.to
      : fixedFrom;
  return {
    range: { from, to: availableRange.to },
    clampedToAvailableStart,
  };
}

export function resolveFixedRange(
  fixedRange: { from: string; to: string | null },
  availableRange: ChartDateRange,
) {
  const requestedTo = fixedRange.to ?? availableRange.to;
  const from = fixedRange.from < availableRange.from
    ? availableRange.from
    : fixedRange.from > availableRange.to
      ? availableRange.to
      : fixedRange.from;
  const to = requestedTo > availableRange.to
    ? availableRange.to
    : requestedTo < availableRange.from
      ? availableRange.from
      : requestedTo;
  return {
    range: from <= to ? { from, to } : { from: to, to },
    clampedFrom: from !== fixedRange.from,
    clampedTo: to !== requestedTo,
  };
}

export function resolveRangeInputDefaults(
  availableRange: ChartDateRange | null | undefined,
  comparisonRange: ChartDateRange | null | undefined,
  fallbackRange: ChartDateRange,
) {
  return availableRange ?? comparisonRange ?? fallbackRange;
}

export function formatFullDate(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${date.getUTCFullYear()}-${padMonth(date.getUTCMonth() + 1)}-${padMonth(date.getUTCDate())}`;
}

export function formatEdgeAxisDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) {
    return dateKey;
  }

  return `${year}\n${month}-${day}`;
}

export function formatAxisDateLabel(
  dateKey: string,
  index: number,
  allDateKeys: string[],
) {
  const date = parseDateKey(dateKey);
  const previousDate = index > 0 ? parseDateKey(allDateKeys[index - 1] ?? "") : null;
  const firstDate = allDateKeys[0] ? parseDateKey(allDateKeys[0]) : date;
  const lastDate = allDateKeys[allDateKeys.length - 1]
    ? parseDateKey(allDateKeys[allDateKeys.length - 1]!)
    : date;
  const spansMultipleYears =
    firstDate.getUTCFullYear() !== lastDate.getUTCFullYear();

  const monthDay = `${padMonth(date.getUTCMonth() + 1)}-${padMonth(date.getUTCDate())}`;
  const yearMonth = `${date.getUTCFullYear()}-${padMonth(date.getUTCMonth() + 1)}`;

  if (index === 0) {
    return spansMultipleYears ? yearMonth : monthDay;
  }

  const yearChanged =
    previousDate !== null &&
    previousDate.getUTCFullYear() !== date.getUTCFullYear();
  if (yearChanged) {
    return yearMonth;
  }

  const totalDays = Math.round(
    (lastDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (spansMultipleYears && totalDays > 365 * 3) {
    return date.getUTCMonth() === 0 ? String(date.getUTCFullYear()) : "";
  }

  if (spansMultipleYears && date.getUTCMonth() === 0 && date.getUTCDate() <= 7) {
    return yearMonth;
  }

  return monthDay;
}
