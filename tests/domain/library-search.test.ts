import { describe, expect, test } from "vitest";
import { searchLibraryOptions } from "@/lib/funds/library-search";

const options = [
  { id: "a", code: "110022", name: "易方达消费行业股票" },
  { id: "b", code: "000300", name: "沪深300" },
  { id: "c", code: "SPX", name: "标普500" },
];

describe("library option search", () => {
  test("requires a query and matches name or code", () => {
    expect(searchLibraryOptions(options, "", new Set())).toEqual([]);
    expect(
      searchLibraryOptions(options, "110", new Set()).map((item) => item.id),
    ).toEqual(["a"]);
    expect(
      searchLibraryOptions(options, "标普", new Set()).map((item) => item.id),
    ).toEqual(["c"]);
  });

  test("excludes selected entries and respects the result limit", () => {
    expect(
      searchLibraryOptions(options, "0", new Set(["a"]), 1).map(
        (item) => item.id,
      ),
    ).toEqual(["b"]);
  });
});
