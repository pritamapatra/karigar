import { HttpError } from "./authz";
import { saveGate, type ReadingField } from "./ai-reading";

type Reading = {
  confidence: "high" | "low" | "unreadable";
  weightMg: number | null;
  purityH: number | null;
};

type Input = {
  weightMg: number;
  purityH: number;
  reading: Reading;
  overrideReason?: string;
};

export function checkReceiptAi(input: Input): {
  status: "confirmed" | "overridden";
  reason: string | null;
} {
  const { reading } = input;
  const reason = input.overrideReason?.trim() || null;

  function field(value: number | null): ReadingField {
    return {
      value,
      state:
        value === null || reading.confidence === "unreadable"
          ? "cant_read"
          : reading.confidence === "high"
            ? "ok"
            : "needs_review",
    };
  }

  const weight = saveGate({
    typed: input.weightMg,
    reading: field(reading.weightMg),
    overrideReason: reason ?? undefined,
  });
  const purity = saveGate({
    typed: input.purityH,
    reading: field(reading.purityH),
    overrideReason: reason ?? undefined,
  });

  if (!weight.allowed || !purity.allowed) {
    throw new HttpError(
      409,
      "Typed weight or purity differs from the AI reading. Provide an override reason.",
    );
  }

  const overridden =
    weight.status === "overridden" || purity.status === "overridden";

  return {
    status: overridden ? "overridden" : "confirmed",
    reason: overridden ? reason : null,
  };
}
