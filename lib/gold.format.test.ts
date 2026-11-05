import { describe, expect, test } from "vitest";
import { formatGrams, formatPurity } from "./gold";

describe("formatting", () => {
  test("F1 grams always show 3 decimals and the unit", () => {
    expect(formatGrams(109920)).toBe("109.920 g");
    expect(formatGrams(0)).toBe("0.000 g");
  });

  test("F2 grams group thousands", () => {
    expect(formatGrams(20000000)).toBe("20,000.000 g");
  });

  test("F3 small values keep leading zeros", () => {
    expect(formatGrams(5)).toBe("0.005 g");
  });

  test("F4 negative values show a minus sign", () => {
    expect(formatGrams(-3023)).toBe("-3.023 g");
  });

  test("F5 purity always shows 2 decimals and a percent sign", () => {
    expect(formatPurity(9160)).toBe("91.60 %");
    expect(formatPurity(10000)).toBe("100.00 %");
    expect(formatPurity(1)).toBe("0.01 %");
    expect(() => formatPurity(91.6)).toThrow(RangeError);
  });
});
