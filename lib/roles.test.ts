import { describe, expect, test } from "vitest";
import { LANDING_BY_ROLE, NAV_BY_ROLE } from "./roles";
import { NAV } from "./nav";

describe("role navigation", () => {
  test("clerk sees issue and receipt but never stock or alerts", () => {
    expect(NAV_BY_ROLE.clerk).toEqual(
      expect.arrayContaining(["issue", "receipt"]),
    );
    expect(NAV_BY_ROLE.clerk).not.toContain("stock");
    expect(NAV_BY_ROLE.clerk).not.toContain("alerts");
  });

  test("finance sees stock and alerts", () => {
    expect(NAV_BY_ROLE.finance).toEqual(
      expect.arrayContaining(["stock", "alerts"]),
    );
  });

  test("partner is read-only: no issue, receipt or sync", () => {
    for (const id of ["issue", "receipt", "sync"] as const) {
      expect(NAV_BY_ROLE.partner).not.toContain(id);
    }
  });

  test("every role lands on a screen in its own menu", () => {
    for (const role of Object.keys(
      NAV_BY_ROLE,
    ) as (keyof typeof NAV_BY_ROLE)[]) {
      const landing = LANDING_BY_ROLE[role];
      expect(NAV_BY_ROLE[role].map((id) => NAV[id].href)).toContain(landing);
    }
  });
});
