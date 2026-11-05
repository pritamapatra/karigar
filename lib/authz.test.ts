import { describe, expect, test } from "vitest";
import {
  HttpError,
  authorize,
  errorResponse,
  type ProfileRow,
  type Role,
} from "./authz";

function profile(role: Role): ProfileRow {
  return {
    id: "u1",
    orgId: "org1",
    role,
    karigarId: null,
    displayName: "Test",
  };
}

function statusOf(fn: () => unknown): number | null {
  try {
    fn();
  } catch (error) {
    return error instanceof HttpError ? error.status : null;
  }
  return null;
}

describe("requireRole decision", () => {
  test("I8 no session gives 401", () => {
    expect(statusOf(() => authorize(null, null, ["clerk"]))).toBe(401);
  });

  test("I9 signed in with the wrong role gives 403", () => {
    expect(
      statusOf(() => authorize("u1", profile("clerk"), ["finance", "partner"])),
    ).toBe(403);
  });

  test("I12 partner is refused on a write route", () => {
    expect(
      statusOf(() => authorize("u1", profile("partner"), ["clerk", "finance"])),
    ).toBe(403);
  });

  test("an allowed role receives its session", () => {
    const session = authorize("u1", profile("finance"), ["clerk", "finance"]);
    expect(session).toMatchObject({
      userId: "u1",
      orgId: "org1",
      role: "finance",
    });
  });

  test("a user without a profile gives 403", () => {
    expect(statusOf(() => authorize("u1", null, ["clerk"]))).toBe(403);
  });

  test("errorResponse maps errors to JSON with the right status", async () => {
    const res = errorResponse(new HttpError(401, "Sign in required"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in required" });
    expect(() => errorResponse(new Error("boom"))).toThrow("boom");
  });
});
