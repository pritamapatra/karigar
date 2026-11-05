const PURITY_SCALE = 10000;

export function fineMg(grossMg: number, purityH: number): number {
  return Math.floor((grossMg * purityH + PURITY_SCALE / 2) / PURITY_SCALE);
}
