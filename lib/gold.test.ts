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
