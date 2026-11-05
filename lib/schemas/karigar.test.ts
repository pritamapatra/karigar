import { describe, expect, it } from "vitest";
import { createKarigarSchema, updateKarigarSchema } from "./karigar";

const cat = "6f1c2a52-3c1e-4d0e-8a57-0d8f5b1f9a10";

describe("karigar schemas", () => {
  it("accepts a valid create and uppercases the code", () => {
    const r = createKarigarSchema.parse({ name: "Anand R", code: "k-021", wastage: [{ categoryId: cat, wastageBp: 300 }] });
    expect(r.code).toBe("K-021");
  });
  it("defaults wastage to empty", () => {
    expect(createKarigarSchema.parse({ name: "Anand R", code: "K-021" }).wastage).toEqual([]);
  });
  it("rejects short name, bad category and out-of-range wastage", () => {
    expect(createKarigarSchema.safeParse({ name: "A", code: "K-021" }).success).toBe(false);
    expect(createKarigarSchema.safeParse({ name: "Anand R", code: "K-021", wastage: [{ categoryId: "x", wastageBp: 300 }] }).success).toBe(false);
    expect(createKarigarSchema.safeParse({ name: "Anand R", code: "K-021", wastage: [{ categoryId: cat, wastageBp: 2001 }] }).success).toBe(false);
    expect(createKarigarSchema.safeParse({ name: "Anand R", code: "K-021", wastage: [{ categoryId: cat, wastageBp: 3.5 }] }).success).toBe(false);
  });
  it("rejects an empty update", () => {
    expect(updateKarigarSchema.safeParse({}).success).toBe(false);
    expect(updateKarigarSchema.safeParse({ active: false }).success).toBe(true);
  });
});
