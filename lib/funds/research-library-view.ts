export const UNCATEGORIZED_RESEARCH_CATEGORY_ID = "uncategorized";

export function isFundInResearchCategory(
  categoryIds: string[],
  activeCategoryId: string,
) {
  if (activeCategoryId === "all") return true;
  if (activeCategoryId === UNCATEGORIZED_RESEARCH_CATEGORY_ID)
    return categoryIds.length === 0;
  return categoryIds.includes(activeCategoryId);
}

export function compareFollowedAtDescending(
  left: { followedAt: string },
  right: { followedAt: string },
) {
  return right.followedAt.localeCompare(left.followedAt);
}
