import type { FundSearchResult } from "@/lib/funds/providers/types";

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function relevance(result: FundSearchResult, query: string) {
  const code = normalizedText(result.code);
  const name = normalizedText(result.name);
  if (code === query) return 0;
  if (name === query) return 1;
  if (code.startsWith(query)) return 2;
  if (name.startsWith(query)) return 3;
  return 4;
}

export function rankFundSearchResults(results: FundSearchResult[], query: string) {
  const normalizedQuery = normalizedText(query);
  return [...results].sort((left, right) => {
    const relevanceDifference = relevance(left, normalizedQuery) - relevance(right, normalizedQuery);
    if (relevanceDifference !== 0) return relevanceDifference;
    if (left.establishedDate && right.establishedDate) {
      const dateDifference = left.establishedDate.localeCompare(right.establishedDate);
      if (dateDifference !== 0) return dateDifference;
    } else if (left.establishedDate) {
      return -1;
    } else if (right.establishedDate) {
      return 1;
    }
    return left.code.localeCompare(right.code);
  });
}
