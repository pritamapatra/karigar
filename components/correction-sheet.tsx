"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatGrams } from "@/lib/gold";

export type CorrectionTarget = {
  id: string;
  slipNo: string;
  fineMg: number;
};

export function CorrectionSheet({
  entry,
  onOpenChange,
  onPendingChange,
  onSaved,
}: {
  entry: CorrectionTarget;
  onOpenChange: (open: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const inFlight = useRef(false);
  const normalizedReason = reason.trim();
  const valid = normalizedReason.length > 0 && normalizedReason.length <= 500;

  async function save() {
    if (inFlight.current || (!requestRef.current && !valid)) return;

    if (!requestRef.current) {
      requestRef.current = JSON.stringify({
        entryId: entry.id,
        reason: normalizedReason,
        idempotencyKey: crypto.randomUUID(),
      });
    }

    inFlight.current = true;
    setBusy(true);
    setPending(true);
    onPendingChange(true);
    setError(null);

    let succeeded = false;
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestRef.current,
      });

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          const body = await response.json().catch(() => null);
          requestRef.current = null;
          setPending(false);
          onPendingChange(false);
          setError(
            typeof body?.error === "string"
              ? body.error
              : "Correction was rejected. Check your session and the entry.",
          );
          return;
        }
        throw new Error("Correction result is uncertain");
      }

      const result: { entry: { slipNo: string } } = await response.json();
      toast.success(`Receipt reversed. Slip ${result.entry.slipNo}`);
      requestRef.current = null;
      setPending(false);
      onPendingChange(false);
      succeeded = true;
    } catch {
      setError(
        "Could not confirm the correction. Retry the same request before changing the reason or leaving this sheet.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }

    if (succeeded) onSaved();
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!inFlight.current && !requestRef.current) onOpenChange(open);
      }}
    >
      <SheetContent
        showCloseButton={!busy && !pending}
        className="glass w-full! overflow-y-auto sm:max-w-md!"
      >
        <SheetHeader>
          <SheetTitle>Correct receipt {entry.slipNo}</SheetTitle>
          <SheetDescription>
            Post a reversing entry. The original receipt stays visible.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="border-line space-y-2 rounded-xl border bg-white p-4">
            <p className="text-ink-2 text-sm">
              Fine gold restored to the balance
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatGrams(-entry.fineMg)}
            </p>
            <p className="text-ink-2 text-sm">
              This only reverses the receipt. Record any replacement receipt
              separately. The reversal is posted now, not on the original
              receipt date.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="correction-reason">Reason (required)</Label>
            <textarea
              id="correction-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy || pending}
              maxLength={500}
              rows={4}
              aria-describedby="correction-reason-help"
              className="border-line focus-visible:ring-gold-ink w-full rounded-xl border bg-white p-3 text-base outline-none focus-visible:ring-2 disabled:opacity-60"
            />
            <p id="correction-reason-help" className="text-ink-2 text-sm">
              Explain what was wrong. Maximum 500 characters.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-ink text-sm">
              {error}
            </p>
          )}
          <Button
            className="min-h-12 w-full"
            disabled={busy || (!pending && !valid)}
            onClick={save}
          >
            {busy
              ? "Reversing receipt..."
              : pending
                ? "Retry correction"
                : "Reverse receipt"}
          </Button>
          {!pending && !busy && (
            <Button
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
