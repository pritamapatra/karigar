export function parseGramsToMg(v: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(v.trim());
  if (!m) return null;
  const mg = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0") || "0");
  return mg >= 1 && mg <= 10_000_000 ? mg : null;
}

export function parsePurityToH(v: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return h >= 1 && h <= 10000 ? h : null;
}
