import { describe, expect, test } from "vitest";

describe("smoke", () => {
  test("basic math still works", () => {
    expect(1 + 1).toBe(2);
  });
});
