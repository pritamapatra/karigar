import { describe, expect, test } from "vitest";
import { correctionSchema } from "./correction";

const valid = {
  entryId: "11111111-1111-4111-8111-111111111111",
  reason: "Wrong receipt weight",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
};

describe("correction input", () => {
  test("accepts a receipt reference and trims the reason", () => {
    const parsed = correctionSchema.parse({
      ...valid,
      reason: "  Wrong receipt weight  ",
    });
    expect(parsed).toEqual(valid);
  });

  test.each([
    {},
    { reason: undefined },
    { reason: "" },
    { reason: "   \t\n" },
    { reason: null },
  ])("I4 rejects missing or blank reason: %j", (change) => {
    const input = { ...valid, ...change };
    if (Object.keys(change).length === 0)
      Reflect.deleteProperty(input, "reason");
    expect(correctionSchema.safeParse(input).success).toBe(false);
  });

  test("accepts exactly 500 reason characters after trimming", () => {
    const parsed = correctionSchema.parse({
      ...valid,
      reason: `  ${"a".repeat(500)}  `,
    });
    expect(parsed.reason).toHaveLength(500);
  });

  test("rejects a reason longer than 500 characters", () => {
    expect(
      correctionSchema.safeParse({
        ...valid,
        reason: "a".repeat(501),
      }).success,
    ).toBe(false);
  });

  test.each(["entryId", "idempotencyKey"] as const)(
    "rejects missing or malformed %s",
    (field) => {
      expect(
        correctionSchema.safeParse({ ...valid, [field]: undefined }).success,
      ).toBe(false);
      expect(
        correctionSchema.safeParse({ ...valid, [field]: "not-a-uuid" }).success,
      ).toBe(false);
    },
  );

  test.each([
    { fineMg: 916 },
    { grossMg: 1000 },
    { purityH: 9160 },
    { orgId: valid.entryId },
    { userId: valid.entryId },
    { extra: true },
  ])("rejects unknown fields: %j", (extra) => {
    expect(correctionSchema.safeParse({ ...valid, ...extra }).success).toBe(
      false,
    );
  });
});
