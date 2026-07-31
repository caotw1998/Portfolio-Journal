import { describe, expect, test } from "vitest";
import { buildPaddedValueAxisDomain } from "@/lib/chart-axis-domain";

describe("chart axis domain", () => {
  test("pads tightly around normalized values instead of forcing zero", () => {
    const domain = buildPaddedValueAxisDomain([0.93, 1.4, 1.2], {
      minSpan: 0.08,
    });

    expect(domain).toEqual({
      min: 0.89,
      max: 1.44,
    });
  });

  test("keeps drawdown charts anchored near zero", () => {
    const domain = buildPaddedValueAxisDomain([-12.5, -2.1, -7.8], {
      includeZero: true,
      minSpan: 4,
    });

    expect(domain).toEqual({
      min: -13.5,
      max: 1,
    });
  });
});
