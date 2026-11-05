import { describe, expect, test } from "vitest";
import { allowedWastageMg, balanceMg, fineMg, unexplainedMg } from "./gold";

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

describe("wastage and balance", () => {
  test("G10 allowed wastage 3.00% of 109920 is 3298", () => {
    expect(allowedWastageMg(300, 109920)).toBe(3298);
  });

  test("G11 balance after issue, necklace and scrap is 3893", () => {
    expect(balanceMg([109920, -103004, -3023])).toBe(3893);
  });

  test("G12 unexplained loss is 595", () => {
    expect(unexplainedMg(3893, 3298)).toBe(595);
  });

  test("G13 unexplained loss is never negative", () => {
    expect(unexplainedMg(3000, 3298)).toBe(0);
    expect(unexplainedMg(0, 3298)).toBe(0);
  });

  test("G14 zero wastage allows nothing, and bad inputs are rejected", () => {
    expect(allowedWastageMg(0, 109920)).toBe(0);
    expect(balanceMg([])).toBe(0);
    expect(() => allowedWastageMg(-1, 109920)).toThrow(RangeError);
    expect(() => allowedWastageMg(10001, 109920)).toThrow(RangeError);
    expect(() => allowedWastageMg(300, 0)).toThrow(RangeError);
    expect(() => balanceMg([1.5])).toThrow(RangeError);
  });
});
