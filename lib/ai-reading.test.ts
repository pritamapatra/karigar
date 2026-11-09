import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AI_TIMEOUT_MS,
  parseAiReading,
  readScale,
  saveGate,
} from "./ai-reading";

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    kind: "scale",
    weight_g: 112.45,
    purity_pct: 91.6,
    confidence: "high",
    notes: null,
    ...overrides,
  });
}

function readingOf(raw: string) {
  const result = parseAiReading(raw);
  if (!result.ok) throw new Error(`Expected success, got ${result.reason}`);
  return result.reading;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AI response parsing", () => {
  test("A1 converts a valid high-confidence reading to integers", () => {
    const reading = readingOf(payload());
    expect(reading.confidence).toBe("high");
    expect(reading.weight).toEqual({ value: 112450, state: "ok" });
    expect(reading.purity).toEqual({ value: 9160, state: "ok" });
  });

  test("A2 null weight is a can't-read field", () => {
    const reading = readingOf(payload({ weight_g: null }));
    expect(reading.weight).toEqual({ value: null, state: "cant_read" });
    expect(reading.purity.state).toBe("ok");
  });

  test.each(["", "not json", '{"kind":"scale"', "null"])(
    "A3 rejects malformed or non-object JSON: %s",
    (raw) => {
      expect(parseAiReading(raw).ok).toBe(false);
    },
  );

  test("A3 reports malformed JSON distinctly from a wrong shape", () => {
    expect(parseAiReading("{oops")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(parseAiReading(payload({ confidence: "certain" }))).toEqual({
      ok: false,
      reason: "invalid_shape",
    });
  });

  test.each([-1, 0, 90000, 5000.001])(
    "A4 rejects weight %s g as out of range",
    (weight) => {
      expect(parseAiReading(payload({ weight_g: weight }))).toEqual({
        ok: false,
        reason: "out_of_range",
      });
    },
  );

  test.each([100.01, 150, 0, -5])(
    "A5 rejects purity %s as out of range",
    (purity) => {
      expect(parseAiReading(payload({ purity_pct: purity }))).toEqual({
        ok: false,
        reason: "out_of_range",
      });
    },
  );

  test("A5 accepts purity of exactly 100", () => {
    expect(readingOf(payload({ purity_pct: 100 })).purity.value).toBe(10000);
  });

  test("rejects values with more precision than the ledger stores", () => {
    expect(parseAiReading(payload({ weight_g: 112.4501 }))).toEqual({
      ok: false,
      reason: "too_precise",
    });
    expect(parseAiReading(payload({ purity_pct: 91.605 }))).toEqual({
      ok: false,
      reason: "too_precise",
    });
  });

  test.each([
    `Here is the reading: ${payload()}`,
    `${payload()} Hope this helps!`,
    "```json\n" + payload() + "\n```",
  ])("A6 never trusts text around the JSON", (raw) => {
    expect(parseAiReading(raw)).toEqual({ ok: false, reason: "malformed" });
  });

  test("A10 low confidence is highlighted, not confirmed", () => {
    const reading = readingOf(payload({ confidence: "low" }));
    expect(reading.weight).toEqual({ value: 112450, state: "needs_review" });
    expect(reading.purity).toEqual({ value: 9160, state: "needs_review" });
  });

  test("unreadable confidence clears both fields", () => {
    const reading = readingOf(payload({ confidence: "unreadable" }));
    expect(reading.weight).toEqual({ value: null, state: "cant_read" });
    expect(reading.purity).toEqual({ value: null, state: "cant_read" });
  });
});

describe("provider call", () => {
  test("returns the parsed reading when the provider answers in time", async () => {
    const result = await readScale(async () => payload());
    expect(result.ok).toBe(true);
  });

  test("A7 times out after 10 seconds and aborts the request", async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    const pending = readScale((signal) => {
      captured = signal;
      return new Promise<string>(() => {});
    });

    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS - 1);
    expect(captured?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(captured?.aborted).toBe(true);
  });

  test("provider failures become an error state, not an exception", async () => {
    const result = await readScale(async () => {
      throw new Error("503");
    });
    expect(result).toEqual({ ok: false, reason: "provider_error" });
  });
});

describe("save gate", () => {
  const reading = { value: 112450, state: "ok" as const };

  test("A8 blocks a typed value that differs from the reading", () => {
    expect(saveGate({ typed: 112000, reading })).toEqual({
      allowed: false,
      status: "mismatch",
    });
  });

  test("A8 allows a mismatch once an override reason is recorded", () => {
    expect(
      saveGate({ typed: 112000, reading, overrideReason: "Scale glare" }),
    ).toEqual({ allowed: true, status: "overridden" });
  });

  test("A8 treats a blank override reason as missing", () => {
    expect(
      saveGate({ typed: 112000, reading, overrideReason: "   " }).allowed,
    ).toBe(false);
  });

  test("A9 allows a typed value equal to the reading", () => {
    expect(saveGate({ typed: 112450, reading })).toEqual({
      allowed: true,
      status: "match",
    });
  });

  test("never blocks when there is no confirmed reading", () => {
    for (const state of ["cant_read", "needs_review"] as const) {
      expect(
        saveGate({ typed: 100, reading: { value: 112450, state } }).allowed,
      ).toBe(true);
    }
  });
});
