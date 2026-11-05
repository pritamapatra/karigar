const PURITY_SCALE = 10000;
const MAX_GROSS_MG = 100_000_000;

function assertGrossMg(value: number): void {
  if (!Number.isInteger(value))
    throw new RangeError("Weight must be a whole number of milligrams");
  if (value <= 0) throw new RangeError("Weight must be greater than zero");
  if (value > MAX_GROSS_MG) throw new RangeError("Weight is out of range");
}

function assertPurityH(value: number): void {
  if (!Number.isInteger(value))
    throw new RangeError("Purity must be a whole number of hundredths");
  if (value < 1 || value > PURITY_SCALE)
    throw new RangeError("Purity must be between 0.01 and 100.00");
}

export function fineMg(grossMg: number, purityH: number): number {
  assertGrossMg(grossMg);
  assertPurityH(purityH);
  return Math.floor((grossMg * purityH + PURITY_SCALE / 2) / PURITY_SCALE);
}

const BP_SCALE = 10000;

function assertInt(value: number, name: string): void {
  if (!Number.isInteger(value))
    throw new RangeError(`${name} must be a whole number`);
}

export function allowedWastageMg(
  wastageBp: number,
  issuedFineMg: number,
): number {
  assertInt(wastageBp, "Wastage");
  assertInt(issuedFineMg, "Issued fine weight");
  if (wastageBp < 0 || wastageBp > BP_SCALE)
    throw new RangeError("Wastage must be between 0 and 100 percent");
  if (issuedFineMg <= 0)
    throw new RangeError("Issued fine weight must be greater than zero");
  return Math.floor((wastageBp * issuedFineMg + BP_SCALE / 2) / BP_SCALE);
}

export function balanceMg(signedFineMg: readonly number[]): number {
  return signedFineMg.reduce((sum, mg) => {
    assertInt(mg, "Fine weight");
    return sum + mg;
  }, 0);
}

export function unexplainedMg(balance: number, allowedMg: number): number {
  assertInt(balance, "Balance");
  assertInt(allowedMg, "Allowed wastage");
  return Math.max(0, balance - allowedMg);
}

function splitScaled(value: number, scale: number, digits: number) {
  if (!Number.isInteger(value))
    throw new RangeError("Value must be a whole number");
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / scale).toLocaleString("en-US");
  const frac = String(abs % scale).padStart(digits, "0");
  return { sign: value < 0 ? "-" : "", whole, frac };
}

export function formatGrams(mg: number): string {
  const { sign, whole, frac } = splitScaled(mg, 1000, 3);
  return `${sign}${whole}.${frac} g`;
}

export function formatPurity(purityH: number): string {
  const { sign, whole, frac } = splitScaled(purityH, 100, 2);
  return `${sign}${whole}.${frac} %`;
}
