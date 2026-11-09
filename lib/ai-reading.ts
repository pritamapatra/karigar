import { z } from "zod";

export const AI_TIMEOUT_MS = 10_000;
export const MAX_WEIGHT_MG = 5_000_000;
const MAX_PURITY_H = 10_000;

const responseSchema = z.object({
  kind: z.enum(["scale", "karat_meter"]),
  weight_g: z.number().nullable(),
  purity_pct: z.number().nullable(),
  confidence: z.enum(["high", "low", "unreadable"]),
  notes: z.string().nullish(),
});

export type FieldState = "ok" | "needs_review" | "cant_read";
export type ReadingField = { value: number | null; state: FieldState };

export type AiReading = {
  kind: "scale" | "karat_meter";
  confidence: "high" | "low" | "unreadable";
  weight: ReadingField;
  purity: ReadingField;
  notes: string | null;
};

export type AiParseResult =
  | { ok: true; reading: AiReading }
  | {
      ok: false;
      reason:
        | "malformed"
        | "invalid_shape"
        | "out_of_range"
        | "too_precise"
        | "timeout"
        | "provider_error";
    };

type Scaled = { status: "ok"; value: number } | { status: "bad" | "precise" };

function toInteger(value: number, factor: number): Scaled {
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) return { status: "precise" };
  return { status: "ok", value: rounded };
}

function field(
  value: number | null,
  confidence: AiReading["confidence"],
): ReadingField {
  if (value === null || confidence === "unreadable") {
    return { value: null, state: "cant_read" };
  }
  return { value, state: confidence === "high" ? "ok" : "needs_review" };
}

export function parseAiReading(raw: string): AiParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_shape" };
  const data = parsed.data;

  let weightMg: number | null = null;
  if (data.weight_g !== null) {
    const weight = toInteger(data.weight_g, 1000);
    if (weight.status === "precise")
      return { ok: false, reason: "too_precise" };
    if (
      weight.status !== "ok" ||
      weight.value <= 0 ||
      weight.value > MAX_WEIGHT_MG
    ) {
      return { ok: false, reason: "out_of_range" };
    }
    weightMg = weight.value;
  }

  let purityH: number | null = null;
  if (data.purity_pct !== null) {
    const purity = toInteger(data.purity_pct, 100);
    if (purity.status === "precise")
      return { ok: false, reason: "too_precise" };
    if (
      purity.status !== "ok" ||
      purity.value < 1 ||
      purity.value > MAX_PURITY_H
    ) {
      return { ok: false, reason: "out_of_range" };
    }
    purityH = purity.value;
  }

  return {
    ok: true,
    reading: {
      kind: data.kind,
      confidence: data.confidence,
      weight: field(weightMg, data.confidence),
      purity: field(purityH, data.confidence),
      notes: data.notes ?? null,
    },
  };
}

const TIMED_OUT = Symbol("timed out");

export async function readScale(
  call: (signal: AbortSignal) => Promise<string>,
  timeoutMs = AI_TIMEOUT_MS,
): Promise<AiParseResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(TIMED_OUT);
    }, timeoutMs);
  });

  try {
    const raw = await Promise.race([call(controller.signal), timeout]);
    if (raw === TIMED_OUT) return { ok: false, reason: "timeout" };
    return parseAiReading(raw);
  } catch {
    return { ok: false, reason: "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}

export type SaveGate = {
  allowed: boolean;
  status: "no_reading" | "match" | "mismatch" | "overridden";
};

export function saveGate(input: {
  typed: number | null;
  reading: ReadingField;
  overrideReason?: string;
}): SaveGate {
  if (input.reading.state !== "ok" || input.reading.value === null) {
    return { allowed: true, status: "no_reading" };
  }
  if (input.typed === input.reading.value) {
    return { allowed: true, status: "match" };
  }
  if (input.overrideReason?.trim()) {
    return { allowed: true, status: "overridden" };
  }
  return { allowed: false, status: "mismatch" };
}
