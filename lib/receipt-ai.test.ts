import { describe, expect, test } from "vitest";
import { checkReceiptAi } from "./receipt-ai";

const reading = {
  confidence: "high" as const,
  weightMg: 53000,
  purityH: 9160,
};

const input = { weightMg: 53000, purityH: 9160, reading };

describe("receipt AI comparison", () => {
  test("confirms matching weight and purity", () => {
    expect(checkReceiptAi(input)).toEqual({
      status: "confirmed",
      reason: null,
    });
  });

  test.each([
    { weightMg: 53001 },
    { purityH: 9161 },
    { weightMg: 53001, purityH: 9161 },
  ])("blocks a high-confidence mismatch: %j", (changes) => {
    expect(() => checkReceiptAi({ ...input, ...changes })).toThrow(
      "Provide an override reason",
    );
  });

  test("does not accept a whitespace-only override", () => {
    expect(() =>
      checkReceiptAi({
        ...input,
        weightMg: 53001,
        overrideReason: "   ",
      }),
    ).toThrow("Provide an override reason");
  });

  test("records a trimmed reason when overriding a mismatch", () => {
    expect(
      checkReceiptAi({
        ...input,
        weightMg: 53001,
        overrideReason: "  Checked display manually  ",
      }),
    ).toEqual({
      status: "overridden",
      reason: "Checked display manually",
    });
  });

  test("one override reason covers weight and purity mismatches", () => {
    expect(
      checkReceiptAi({
        ...input,
        weightMg: 53001,
        purityH: 9161,
        overrideReason: "Checked both values manually",
      }),
    ).toEqual({
      status: "overridden",
      reason: "Checked both values manually",
    });
  });

  test("does not mark matching values as overridden", () => {
    expect(
      checkReceiptAi({ ...input, overrideReason: "Unneeded explanation" }),
    ).toEqual({ status: "confirmed", reason: null });
  });

  test.each(["low", "unreadable"] as const)(
    "%s confidence does not block manually entered values",
    (confidence) => {
      expect(
        checkReceiptAi({
          ...input,
          weightMg: 54000,
          purityH: 9000,
          reading: { ...reading, confidence },
        }),
      ).toEqual({ status: "confirmed", reason: null });
    },
  );

  test("null AI fields do not block manual entry", () => {
    expect(
      checkReceiptAi({
        ...input,
        reading: { ...reading, weightMg: null, purityH: null },
      }),
    ).toEqual({ status: "confirmed", reason: null });
  });

  test("still checks purity when AI weight is null", () => {
    expect(() =>
      checkReceiptAi({
        ...input,
        purityH: 9000,
        reading: { ...reading, weightMg: null },
      }),
    ).toThrow("Provide an override reason");
  });

  test("still checks weight when AI purity is null", () => {
    expect(() =>
      checkReceiptAi({
        ...input,
        weightMg: 54000,
        reading: { ...reading, purityH: null },
      }),
    ).toThrow("Provide an override reason");
  });
});
