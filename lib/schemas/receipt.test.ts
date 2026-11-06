import { describe, expect, it } from "vitest";
import { receiptSchema } from "./receipt";

const common = {
  jobId: "6f1c2a52-3c1e-4d0e-8a57-0d8f5b1f9a10",
  purityH: 9160,
  idempotencyKey: "7f1c2a52-3c1e-4d0e-8a57-0d8f5b1f9a11",
};

describe("receipt validation", () => {
  it("accepts a finished piece with net weight and HUID", () => {
    const result = receiptSchema.parse({
      ...common,
      entryType: "receipt_piece",
      netMg: 112450,
      huid: " ABC123 ",
    });
    expect(result).toMatchObject({ netMg: 112450, huid: "ABC123" });
  });

  it("rejects a piece without net weight or with blank HUID", () => {
    expect(
      receiptSchema.safeParse({
        ...common,
        entryType: "receipt_piece",
        grossMg: 112450,
        huid: "ABC123",
      }).success,
    ).toBe(false);
    expect(
      receiptSchema.safeParse({
        ...common,
        entryType: "receipt_piece",
        netMg: 112450,
        huid: " ",
      }).success,
    ).toBe(false);
  });

  it.each(["receipt_scrap", "receipt_filings"] as const)(
    "accepts %s with gross weight",
    (entryType) => {
      expect(
        receiptSchema.safeParse({
          ...common,
          entryType,
          grossMg: 3300,
        }).success,
      ).toBe(true);
    },
  );

  it.each([0, -1, 3.5, 10_000_001])("rejects invalid weight %s", (grossMg) => {
    expect(
      receiptSchema.safeParse({
        ...common,
        entryType: "receipt_scrap",
        grossMg,
      }).success,
    ).toBe(false);
  });

  it.each([0, 10001, 91.6])("rejects invalid purity %s", (purityH) => {
    expect(
      receiptSchema.safeParse({
        ...common,
        entryType: "receipt_scrap",
        grossMg: 3300,
        purityH,
      }).success,
    ).toBe(false);
  });

  it("rejects client-supplied fine weight", () => {
    expect(
      receiptSchema.safeParse({
        ...common,
        entryType: "receipt_scrap",
        grossMg: 3300,
        fineMg: -3023,
      }).success,
    ).toBe(false);
  });
});
