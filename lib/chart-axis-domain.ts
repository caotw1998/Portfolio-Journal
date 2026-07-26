type ValueAxisDomainOptions = {
  includeZero?: boolean;
  minSpan?: number;
  paddingRatio?: number;
};

function roundAxisValue(value: number) {
  return Number(value.toFixed(2));
}

export function buildPaddedValueAxisDomain(
  values: Array<number | null | undefined>,
  options: ValueAxisDomainOptions = {},
) {
  const finiteValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  if (finiteValues.length === 0) {
    return {};
  }

  const rawMin = Math.min(...finiteValues, options.includeZero ? 0 : Infinity);
  const rawMax = Math.max(...finiteValues, options.includeZero ? 0 : -Infinity);
  const minSpan = options.minSpan ?? 0;
  const valueSpan = Math.max(rawMax - rawMin, minSpan);
  const padding = valueSpan * (options.paddingRatio ?? 0.08);
  const center = (rawMin + rawMax) / 2;
  const halfSpan = valueSpan / 2;

  return {
    min: roundAxisValue(center - halfSpan - padding),
    max: roundAxisValue(center + halfSpan + padding),
  };
}
