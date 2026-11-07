import { HttpError } from "./authz";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

export function exclusiveCutoff(asOn: string): Date {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(asOn)) {
    throw new HttpError(400, "As-on date must be a valid YYYY-MM-DD date");
  }

  const midnightUtc = new Date(`${asOn}T00:00:00.000Z`);
  if (
    !Number.isFinite(midnightUtc.getTime()) ||
    midnightUtc.toISOString().slice(0, 10) !== asOn
  ) {
    throw new HttpError(400, "As-on date must be a valid YYYY-MM-DD date");
  }

  return new Date(midnightUtc.getTime() + DAY_MS - IST_OFFSET_MS);
}
