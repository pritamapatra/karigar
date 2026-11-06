import { describe, expect, it } from "vitest";
import { evaluateJobAlerts, lossBp, type ClosedJobLoss } from "./alerts";

// issued 100000 mg, allowed 3000 mg; unexplained mg => loss bp = mg / 10
const job = (
  id: string,
  unexplained: number,
  actualOverride?: number,
): ClosedJobLoss => ({
  jobId: id,
  issuedFineMg: 100000,
  allowedMg: 3000,
  actualWastageMg: actualOverride ?? 3000 + unexplained,
});
const history = (...u: number[]) => u.map((x, i) => job(`P${i}`, x));
const kinds = (a: { kind: string }[]) => a.map((x) => x.kind);

describe("loss alerts", () => {
  it("L1 no drift when latest is within 50% of baseline", () => {
    const r = evaluateJobAlerts(job("N", 1400), history(1000, 1000, 1000));
    expect(kinds(r)).not.toContain("drift");
  });

  it("L2 drift fires at exactly +50%", () => {
    const r = evaluateJobAlerts(job("N", 1500), history(1000, 1000, 1000));
    expect(r.find((a) => a.kind === "drift")).toMatchObject({
      baselineBp: 100,
      actualBp: 150,
    });
  });

  it("L3 no drift just under +50%", () => {
    const r = evaluateJobAlerts(job("N", 1499), history(1000, 1000, 1000));
    expect(kinds(r)).not.toContain("drift");
  });

  it("L4 fewer than 3 prior jobs gives no drift", () => {
    const r = evaluateJobAlerts(job("N", 5000), history(1000, 1000));
    expect(kinds(r)).not.toContain("drift");
    expect(kinds(r)).toContain("over_allowance");
  });

  it("L5 exactly 3 prior jobs is enough for drift", () => {
    const r = evaluateJobAlerts(job("N", 5000), history(1000, 1000, 1000));
    expect(kinds(r)).toContain("drift");
  });

  it("L6 only the last 5 prior jobs form the baseline", () => {
    const r = evaluateJobAlerts(
      job("N", 1500),
      history(9000, 9000, 1000, 1000, 1000, 1000, 1000),
    );
    expect(r.find((a) => a.kind === "drift")?.baselineBp).toBe(100);
  });

  it("L7 zero baseline skips drift but keeps the single-job check", () => {
    const r = evaluateJobAlerts(job("N", 500), history(0, 0, 0));
    expect(kinds(r)).toEqual(["over_allowance"]);
  });

  it("L8 over-allowance fires only when actual exceeds allowed", () => {
    expect(kinds(evaluateJobAlerts(job("A", 0, 3000), []))).toEqual([]);
    expect(kinds(evaluateJobAlerts(job("B", 0, 3001), []))).toEqual([
      "over_allowance",
    ]);
  });

  it("L9 dedupe key is stable per job and kind", () => {
    const a = evaluateJobAlerts(job("J9", 5000), history(1000, 1000, 1000));
    const b = evaluateJobAlerts(job("J9", 5000), history(1000, 1000, 1000));
    expect(a.map((x) => x.dedupeKey)).toEqual([
      "J9:drift",
      "J9:over_allowance",
    ]);
    expect(b.map((x) => x.dedupeKey)).toEqual(a.map((x) => x.dedupeKey));
  });

  it("L10 wording is neutral and rejects bad input", () => {
    const r = evaluateJobAlerts(job("N", 5000), history(1000, 1000, 1000));
    for (const a of r) {
      expect(a.message).toMatch(/^Review: /);
      expect(a.message).not.toMatch(/theft|steal|stole|fraud|suspect|cheat/i);
    }
    expect(() => lossBp({ ...job("X", 0), issuedFineMg: 0 })).toThrow(
      RangeError,
    );
  });

  it("sample job: 595 mg unexplained is 54 bp (rounded half-up)", () => {
    const sample: ClosedJobLoss = {
      jobId: "S",
      issuedFineMg: 109920,
      allowedMg: 3298,
      actualWastageMg: 3893,
    };
    expect(lossBp(sample)).toBe(54);
  });
});

describe("exact loss-ratio regressions", () => {
  it("averages job loss percentages rather than pooling issue weights", () => {
    const prior: ClosedJobLoss[] = [
      {
        jobId: "P1",
        issuedFineMg: 100000,
        allowedMg: 0,
        actualWastageMg: 1000,
      },
      {
        jobId: "P2",
        issuedFineMg: 200000,
        allowedMg: 0,
        actualWastageMg: 4000,
      },
      {
        jobId: "P3",
        issuedFineMg: 300000,
        allowedMg: 0,
        actualWastageMg: 9000,
      },
    ];

    // Mean loss is (1% + 2% + 3%) / 3 = 2%; threshold is 3%.
    const result = evaluateJobAlerts(job("N", 3000), prior);
    expect(result.find((alert) => alert.kind === "drift")).toMatchObject({
      baselineBp: 200,
      actualBp: 300,
    });
  });

  it("rounds the baseline only after averaging exact ratios", () => {
    // Prior losses: 100.4, 100.4, 101.4 bp; mean is 100.733... bp.
    // Latest: 151 bp, below the exact 151.1 bp threshold.
    const result = evaluateJobAlerts(job("N", 1510), history(1004, 1004, 1014));

    expect(kinds(result)).not.toContain("drift");
    expect(
      result.find((alert) => alert.kind === "over_allowance"),
    ).toMatchObject({ baselineBp: 101, actualBp: 151 });
  });

  it("distinguishes a small positive baseline from an exactly zero baseline", () => {
    // Prior: 0.1 bp each. Latest: 0.2 bp, which exceeds +50%.
    const result = evaluateJobAlerts(job("N", 2), history(1, 1, 1));

    expect(result.find((alert) => alert.kind === "drift")).toMatchObject({
      baselineBp: 0,
      actualBp: 0,
    });
  });

  it("rejects unsafe integer weights", () => {
    expect(() =>
      lossBp({
        ...job("N", 0),
        issuedFineMg: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(RangeError);
  });
});
