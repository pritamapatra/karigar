import { unexplainedMg } from "./gold";

const BP_SCALE = 10000;
export const BASELINE_WINDOW = 5;
export const MIN_BASELINE_JOBS = 3;

export type ClosedJobLoss = {
  jobId: string;
  issuedFineMg: number;
  allowedMg: number;
  actualWastageMg: number;
};

export type AlertKind = "drift" | "over_allowance";

export type AlertCandidate = {
  kind: AlertKind;
  jobId: string;
  baselineBp: number | null;
  actualBp: number;
  message: string;
  dedupeKey: string;
};

function assertJob(job: ClosedJobLoss): void {
  for (const [name, v] of [
    ["Issued fine weight", job.issuedFineMg],
    ["Allowed wastage", job.allowedMg],
    ["Actual wastage", job.actualWastageMg],
  ] as const) {
    if (!Number.isSafeInteger(v))
      throw new RangeError(`${name} must be a whole number`);
  }
  if (job.issuedFineMg <= 0)
    throw new RangeError("Issued fine weight must be greater than zero");
  if (job.allowedMg < 0 || job.actualWastageMg < 0)
    throw new RangeError("Wastage cannot be negative");
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): number {
  const rounded =
    (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("Rounded loss is out of range");
  return Number(rounded);
}

export function unexplainedOf(job: ClosedJobLoss): number {
  return unexplainedMg(job.actualWastageMg, job.allowedMg);
}

export function lossBp(job: ClosedJobLoss): number {
  assertJob(job);
  return divRoundHalfUp(
    BigInt(unexplainedOf(job)) * BigInt(BP_SCALE),
    BigInt(job.issuedFineMg),
  );
}

export function evaluateJobAlerts(
  latest: ClosedJobLoss,
  priorChronological: readonly ClosedJobLoss[],
): AlertCandidate[] {
  const actualBp = lossBp(latest);
  const window = priorChronological.slice(-BASELINE_WINDOW);
  const alerts: AlertCandidate[] = [];

  let baselineBp: number | null = null;
  if (window.length >= MIN_BASELINE_JOBS) {
    // Sum each job's exact loss ratio, not rounded bp or pooled weights.
    let sumNumerator = BigInt(0);
    let sumDenominator = BigInt(1);
    for (const prior of window) {
      assertJob(prior);
      const numerator = BigInt(unexplainedOf(prior));
      const denominator = BigInt(prior.issuedFineMg);
      sumNumerator = sumNumerator * denominator + numerator * sumDenominator;
      sumDenominator *= denominator;
    }

    const count = BigInt(window.length);
    baselineBp = divRoundHalfUp(
      sumNumerator * BigInt(BP_SCALE),
      sumDenominator * count,
    );

    // latest >= 1.5 * mean(prior ratios); skip an exactly zero baseline.
    const latestNumerator = BigInt(unexplainedOf(latest));
    const latestDenominator = BigInt(latest.issuedFineMg);
    if (
      sumNumerator > BigInt(0) &&
      latestNumerator * sumDenominator * count * BigInt(2) >=
        sumNumerator * latestDenominator * BigInt(3)
    ) {
      alerts.push({
        kind: "drift",
        jobId: latest.jobId,
        baselineBp,
        actualBp,
        message: "Review: loss is above this karigar's usual range",
        dedupeKey: `${latest.jobId}:drift`,
      });
    }
  }

  if (latest.actualWastageMg > latest.allowedMg) {
    alerts.push({
      kind: "over_allowance",
      jobId: latest.jobId,
      baselineBp,
      actualBp,
      message: "Review: wastage on this job is above the agreed allowance",
      dedupeKey: `${latest.jobId}:over_allowance`,
    });
  }

  return alerts;
}
