import { describe, expect, it } from "vitest";
import { parseGramsToMg, parsePurityToH } from "./gold-input";

describe("gold input parsers", () => {
  it("parses grams to integer milligrams", () => {
    expect(parseGramsToMg("120.000")).toBe(120000);
    expect(parseGramsToMg("112.45")).toBe(112450);
    expect(parseGramsToMg("3.3")).toBe(3300);
  });
  it("rejects bad grams", () => {
    for (const v of ["0", "0.000", "1.2345", "abc", "", "-1", "10001"]) {
      expect(parseGramsToMg(v)).toBeNull();
    }
  });
  it("parses purity to hundredths", () => {
    expect(parsePurityToH("91.60")).toBe(9160);
    expect(parsePurityToH("100")).toBe(10000);
    expect(parsePurityToH("99.9")).toBe(9990);
  });
  it("rejects bad purity", () => {
    for (const v of ["0", "100.01", "91.605", "x", ""]) {
      expect(parsePurityToH(v)).toBeNull();
    }
  });
});
