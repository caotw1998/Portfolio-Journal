export const DEFAULT_RESEARCH_CATEGORY_NAMES = ["A股", "港股", "海外资产"] as const;
export const MAX_RESEARCH_CATEGORIES = 20;

export function normalizeResearchCategoryName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("分类名称不能为空。");
  const name = value.trim();
  if (name.length > 24) throw new Error("分类名称不能超过 24 个字符。");
  return name;
}
