"use client";

/* eslint-disable @next/next/no-img-element -- Local object URLs are not remote images. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { saveGate, type AiReading, type ReadingField } from "@/lib/ai-reading";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewUrl: string | null;
  reading?: AiReading;
  busy: boolean;
  message: string | null;
  error: string | null;
  typedWeight: number | null;
  typedPurity: number | null;
  onUseReading?: (reading: AiReading) => void;
};

function display(
  value: number | null,
  factor: number,
  decimals: number,
  unit: string,
) {
  return value === null
    ? "Not entered"
    : `${(value / factor).toFixed(decimals)} ${unit}`;
}

function Comparison({
  label,
  field,
  typed,
  factor,
  decimals,
  unit,
}: {
  label: string;
  field: ReadingField;
  typed: number | null;
  factor: number;
  decimals: number;
  unit: string;
}) {
  const mismatch = !saveGate({ typed, reading: field }).allowed;
  return (
    <div
      className={`space-y-1 rounded-lg border p-3 ${mismatch ? "border-alert-amber border-2" : "border-line"}`}
    >
      <p className="font-medium">{label}</p>
      <p className="tabular-nums">
        AI:{" "}
        {field.state === "ok" && field.value !== null
          ? display(field.value, factor, decimals, unit)
          : "Could not read this confidently. Please type it."}
      </p>
      <p className="tabular-nums">
        You typed: {display(typed, factor, decimals, unit)}
      </p>
      {field.state === "ok" && field.value !== null && (
        <p>
          {mismatch
            ? "These two values differ. Please check the photo."
            : "Matches"}
        </p>
      )}
    </div>
  );
}

export function AiPhotoSheet({
  open,
  onOpenChange,
  previewUrl,
  reading,
  busy,
  message,
  error,
  typedWeight,
  typedPurity,
  onUseReading,
}: Props) {
  const [zoomed, setZoomed] = useState(false);
  const usable = Boolean(
    reading &&
    ((reading.weight.state === "ok" && reading.weight.value !== null) ||
      (reading.purity.state === "ok" && reading.purity.value !== null)),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-white"
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Check this reading</SheetTitle>
          <SheetDescription>
            Compare the display with the suggested and typed values before
            saving.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6 md:grid-cols-2">
          <div className="border-line min-w-0 space-y-3 rounded-xl border bg-white p-3">
            {previewUrl ? (
              <>
                <div className="max-h-[50dvh] overflow-auto">
                  <img
                    src={previewUrl}
                    alt="Selected scale or karat meter photo"
                    className={
                      zoomed
                        ? "h-auto w-[200%] max-w-none"
                        : "max-h-80 w-full object-contain"
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={zoomed}
                  onClick={() => setZoomed((value) => !value)}
                >
                  {zoomed ? "Fit photo" : "Zoom photo"}
                </Button>
              </>
            ) : (
              <p>Photo preview is unavailable in this browser.</p>
            )}
          </div>
          <div className="border-line min-w-0 space-y-3 rounded-xl border bg-white p-4">
            {busy ? (
              <p role="status" aria-live="polite">
                Reading photo…
              </p>
            ) : error ? (
              <div role="alert">
                <p>Photo reading is unavailable. You can type the values.</p>
                <p className="text-sm">{error}</p>
              </div>
            ) : reading ? (
              <>
                <p>Confidence: {reading.confidence}</p>
                {reading.confidence !== "high" && (
                  <p>
                    Could not read this confidently. Please type the values
                    after checking the photo.
                  </p>
                )}
                <Comparison
                  label="Weight"
                  field={reading.weight}
                  typed={typedWeight}
                  factor={1000}
                  decimals={3}
                  unit="g"
                />
                <Comparison
                  label="Purity"
                  field={reading.purity}
                  typed={typedPurity}
                  factor={100}
                  decimals={2}
                  unit="%"
                />
                {reading.notes && <p className="text-sm">{reading.notes}</p>}
              </>
            ) : (
              <p>
                {message ??
                  "No reading is available. Check the photo and enter values manually."}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {onUseReading && (
                <Button
                  type="button"
                  disabled={busy || Boolean(error) || !usable}
                  onClick={() => {
                    if (!reading || !usable || busy || error) return;
                    onUseReading(reading);
                    onOpenChange(false);
                  }}
                >
                  Use reading
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Type it myself
              </Button>
            </div>
            <p className="text-ink-2 text-sm">
              Only readable high-confidence fields can be copied. Other fields
              need manual entry. A mismatch must be corrected or explained in
              the form before saving.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
