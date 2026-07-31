export function resolveLatestDisclosedSnapshot<T extends { reportDate: string }>(
  snapshots: T[],
  selectedDate: string,
): T | null {
  return snapshots
    .filter((snapshot) => snapshot.reportDate <= selectedDate)
    .sort((left, right) => right.reportDate.localeCompare(left.reportDate))[0] ?? null;
}

type ScaleSnapshot = {
  reportDate: string;
  netAssets: number | null;
  shares: number | null;
};

type FlowSnapshot = {
  reportDate: string;
  subscriptions: number | null;
  redemptions: number | null;
  totalShares: number | null;
};

type HolderSnapshot = {
  reportDate: string;
  institutionPercent: number | null;
  individualPercent: number | null;
  internalPercent: number | null;
};

export type CapitalHistoryPeriod = {
  reportDate: string;
  netAssets: number | null;
  totalShares: number | null;
  subscriptions: number | null;
  redemptions: number | null;
  netSubscriptions: number | null;
  institutionPercent: number | null;
  individualPercent: number | null;
  internalPercent: number | null;
  holderDisclosedAt: string | null;
  holderStack: {
    institution: number;
    individual: number;
    internal: number;
  } | null;
};

function dateOnly(value: string) {
  return value.slice(0, 10);
}

export function buildCapitalHistoryPeriods({
  scaleSnapshots,
  flowSnapshots,
  holderSnapshots,
}: {
  scaleSnapshots: ScaleSnapshot[];
  flowSnapshots: FlowSnapshot[];
  holderSnapshots: HolderSnapshot[];
}): CapitalHistoryPeriod[] {
  const normalizedScales = scaleSnapshots.map((snapshot) => ({ ...snapshot, reportDate: dateOnly(snapshot.reportDate) }));
  const normalizedFlows = flowSnapshots.map((snapshot) => ({ ...snapshot, reportDate: dateOnly(snapshot.reportDate) }));
  const normalizedHolders = holderSnapshots.map((snapshot) => ({ ...snapshot, reportDate: dateOnly(snapshot.reportDate) }));
  const reportDates = Array.from(new Set([
    ...normalizedScales.map((snapshot) => snapshot.reportDate),
    ...normalizedFlows.map((snapshot) => snapshot.reportDate),
    ...normalizedHolders.map((snapshot) => snapshot.reportDate),
  ])).sort();

  return reportDates.map((selectedDate) => {
    const scale = normalizedScales.find((snapshot) => snapshot.reportDate === selectedDate);
    const flow = normalizedFlows.find((snapshot) => snapshot.reportDate === selectedDate);
    const holders = resolveLatestDisclosedSnapshot(normalizedHolders, selectedDate);
    const netSubscriptions = flow?.subscriptions !== null && flow?.subscriptions !== undefined
      && flow.redemptions !== null && flow.redemptions !== undefined
      ? flow.subscriptions - flow.redemptions
      : null;
    const holderValues = holders && holders.institutionPercent !== null
      && holders.individualPercent !== null && holders.internalPercent !== null
      ? [holders.institutionPercent, holders.individualPercent, holders.internalPercent]
      : null;
    const holderTotal = holderValues?.reduce((total, value) => total + value, 0) ?? 0;
    const holderStack = holderValues && holderTotal > 0 ? {
      institution: holderValues[0]! / holderTotal * 100,
      individual: holderValues[1]! / holderTotal * 100,
      internal: holderValues[2]! / holderTotal * 100,
    } : null;

    return {
      reportDate: selectedDate,
      netAssets: scale?.netAssets ?? null,
      totalShares: flow?.totalShares ?? scale?.shares ?? null,
      subscriptions: flow?.subscriptions ?? null,
      redemptions: flow?.redemptions ?? null,
      netSubscriptions,
      institutionPercent: holders?.institutionPercent ?? null,
      individualPercent: holders?.individualPercent ?? null,
      internalPercent: holders?.internalPercent ?? null,
      holderDisclosedAt: holders?.reportDate ?? null,
      holderStack,
    };
  });
}

export function selectCapitalHistoryPage<T>(periods: T[], pageIndex: number, pageSize = 3): T[] {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || !Number.isInteger(pageSize) || pageSize < 1) return [];
  const end = periods.length - pageIndex * pageSize;
  if (end <= 0) return [];
  return periods.slice(Math.max(0, end - pageSize), end);
}
