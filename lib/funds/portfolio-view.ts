export type PortfolioHoldingInput = {
  id: string;
  code: string | null;
  name: string;
  weight: number | null;
};

export type HoldingChangeKind = "increase" | "decrease" | "flat" | "new" | "unavailable";

export type PortfolioHoldingRow<Holding extends PortfolioHoldingInput> = Holding & {
  change: number | null;
  changeKind: HoldingChangeKind;
};

function holdingIdentity(holding: Pick<PortfolioHoldingInput, "code" | "name">) {
  const code = holding.code?.trim().toUpperCase();
  return code ? `code:${code}` : `name:${holding.name.trim()}`;
}

export function buildPortfolioHoldingRows<Holding extends PortfolioHoldingInput>(
  currentHoldings: Holding[],
  previousHoldings: PortfolioHoldingInput[],
  hasPreviousReport = previousHoldings.length > 0,
): PortfolioHoldingRow<Holding>[] {
  const previousByIdentity = new Map(
    previousHoldings.map((holding) => [holdingIdentity(holding), holding]),
  );

  return [...currentHoldings]
    .sort((left, right) => (right.weight ?? -Infinity) - (left.weight ?? -Infinity))
    .map((holding) => {
      const previous = previousByIdentity.get(holdingIdentity(holding));
      if (!previous) {
        return {
          ...holding,
          change: null,
          changeKind: !hasPreviousReport || holding.weight === null ? "unavailable" : "new",
        };
      }
      if (holding.weight === null || previous.weight === null) {
        return { ...holding, change: null, changeKind: "unavailable" };
      }
      const change = holding.weight - previous.weight;
      return {
        ...holding,
        change,
        changeKind: change > 0 ? "increase" : change < 0 ? "decrease" : "flat",
      };
    });
}

export type IndustryAllocation = { name: string; weight: number };

export type IndustryHoldingInput = {
  rank: number;
  weight: number | null;
  industry: string | null | undefined;
};

export function buildTopTenIndustryAllocations(holdings: IndustryHoldingInput[]): IndustryAllocation[] {
  const weightByIndustry = new Map<string, number>();
  for (const holding of holdings) {
    const industry = holding.industry?.trim();
    if (holding.rank < 1 || holding.rank > 10 || !industry || holding.weight === null || !Number.isFinite(holding.weight) || holding.weight <= 0) continue;
    weightByIndustry.set(industry, (weightByIndustry.get(industry) ?? 0) + holding.weight);
  }
  return [...weightByIndustry.entries()]
    .map(([name, weight]) => ({ name, weight }))
    .sort((left, right) => right.weight - left.weight);
}

export function parseIndustryAllocations(value: unknown): IndustryAllocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): IndustryAllocation[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { name?: unknown; weight?: unknown };
    if (typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    const weight = typeof candidate.weight === "number" ? candidate.weight : Number(candidate.weight);
    if (!Number.isFinite(weight) || weight <= 0) return [];
    return [{ name: candidate.name.trim(), weight }];
  }).sort((left, right) => right.weight - left.weight);
}
