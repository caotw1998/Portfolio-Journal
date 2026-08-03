export type PcfPortfolioComponentInput = {
  id: string;
  quantity: number | null;
  referencePrice: number | null;
  substitutionCashAmount: number | null;
  creationCashSubstitute: number | null;
  redemptionCashSubstitute: number | null;
};

export type PcfPortfolioWeight = {
  id: string;
  referenceValue: number | null;
  basketWeight: number | null;
  valueSource: "market_close" | "official_cash_substitute" | null;
};

function positiveFinite(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function componentReferenceValue(component: PcfPortfolioComponentInput) {
  const quantity = positiveFinite(component.quantity);
  const referencePrice = positiveFinite(component.referencePrice);
  if (quantity !== null && referencePrice !== null) {
    return { referenceValue: quantity * referencePrice, valueSource: "market_close" as const };
  }
  const cashValue = [
    component.substitutionCashAmount,
    component.creationCashSubstitute,
    component.redemptionCashSubstitute,
  ].map(positiveFinite).find((value) => value !== null) ?? null;
  return cashValue === null
    ? { referenceValue: null, valueSource: null }
    : { referenceValue: cashValue, valueSource: "official_cash_substitute" as const };
}

export function calculatePcfPortfolioWeights(components: PcfPortfolioComponentInput[]): PcfPortfolioWeight[] {
  const resolved = components.map((component) => ({ id: component.id, ...componentReferenceValue(component) }));
  const isComplete = resolved.length > 0 && resolved.every((component) => component.referenceValue !== null);
  const totalValue = isComplete
    ? resolved.reduce((total, component) => total + (component.referenceValue ?? 0), 0)
    : 0;
  return resolved.map((component) => ({
    ...component,
    basketWeight: isComplete && totalValue > 0 && component.referenceValue !== null
      ? component.referenceValue / totalValue * 100
      : null,
  }));
}
