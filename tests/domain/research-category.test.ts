import { describe, expect, test } from "vitest";
import { normalizeResearchCategoryName } from "@/lib/funds/research-category";

describe("research category validation", () => {
  test("trims a valid category name", () => {
    expect(normalizeResearchCategoryName("  核心观察  ")).toBe("核心观察");
  });

  test("rejects empty or overlong names", () => {
    expect(() => normalizeResearchCategoryName("   ")).toThrow("分类名称不能为空");
    expect(() => normalizeResearchCategoryName("超".repeat(25))).toThrow("24 个字符");
  });
});
