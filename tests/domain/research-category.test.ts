import { describe, expect, test } from "vitest";
import { normalizeResearchCategoryName } from "@/lib/funds/research-category";
import {
  compareFollowedAtDescending,
  isFundInResearchCategory,
  UNCATEGORIZED_RESEARCH_CATEGORY_ID,
} from "@/lib/funds/research-library-view";

describe("research category validation", () => {
  test("trims a valid category name", () => {
    expect(normalizeResearchCategoryName("  核心观察  ")).toBe("核心观察");
  });

  test("rejects empty or overlong names", () => {
    expect(() => normalizeResearchCategoryName("   ")).toThrow(
      "分类名称不能为空",
    );
    expect(() => normalizeResearchCategoryName("超".repeat(25))).toThrow(
      "24 个字符",
    );
  });
});

describe("research library category and date view", () => {
  test("treats funds without categories as uncategorized", () => {
    expect(
      isFundInResearchCategory([], UNCATEGORIZED_RESEARCH_CATEGORY_ID),
    ).toBe(true);
    expect(
      isFundInResearchCategory(["a"], UNCATEGORIZED_RESEARCH_CATEGORY_ID),
    ).toBe(false);
    expect(isFundInResearchCategory(["a"], "a")).toBe(true);
  });

  test("sorts newly followed funds first", () => {
    const funds = [
      { id: "old", followedAt: "2025-01-01T00:00:00.000Z" },
      { id: "new", followedAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(
      funds.sort(compareFollowedAtDescending).map((fund) => fund.id),
    ).toEqual(["new", "old"]);
  });
});
