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
