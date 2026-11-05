import { describe, expect, test } from "vitest";
import { fineMg } from "./gold";

describe("fineMg", () => {
  test("G1 issue 120.000 g at 91.60%", () => {
    expect(fineMg(120000, 9160)).toBe(109920);
  });

  test("G2 necklace 112.450 g rounds down from 103004.2", () => {
    expect(fineMg(112450, 9160)).toBe(103004);
  });

  test("G3 scrap 3.300 g rounds up from 3022.8", () => {
    expect(fineMg(3300, 9160)).toBe(3023);
  });

  test("G4 exact result needs no rounding", () => {
    expect(fineMg(1000, 9170)).toBe(917);
  });

  test("G5 sub-milligram result rounds up to 1", () => {
    expect(fineMg(1, 9160)).toBe(1);
  });
});

describe("fineMg guards", () => {
  test("G6 rejects zero weight", () => {
    expect(() => fineMg(0, 9160)).toThrow(RangeError);
  });

  test("G7 rejects negative weight", () => {
    expect(() => fineMg(-1000, 9160)).toThrow(RangeError);
  });

  test("G8 rejects purity below 1 and above 10000", () => {
    expect(() => fineMg(1000, 0)).toThrow(RangeError);
    expect(() => fineMg(1000, 10001)).toThrow(RangeError);
  });

  test("G9 rejects fractional and non-finite inputs", () => {
    expect(() => fineMg(1000.5, 9160)).toThrow(RangeError);
    expect(() => fineMg(1000, 91.6)).toThrow(RangeError);
    expect(() => fineMg(Number.NaN, 9160)).toThrow(RangeError);
    expect(() => fineMg(Number.POSITIVE_INFINITY, 9160)).toThrow(RangeError);
  });

  test("accepts the purity bounds 1 and 10000", () => {
    expect(fineMg(1000, 10000)).toBe(1000);
    expect(fineMg(10000, 1)).toBe(1);
  });
});
