"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatGrams, formatPurity } from "@/lib/gold";

export type SlipData = {
  slipNo: string;
  issuedAt: string;
  karigarName: string;
  karigarCode: string;
  jobNumber: string;
  category: string;
  grossMg: number;
  purityH: number;
  fineMg: number;
};

const num = { fontFeatureSettings: '"tnum" 1, "zero" 1' } as const;
const grams = (mg: number) => formatGrams(mg).replace(/\s*g$/, "");

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-2">{label}</span>
      <span className="text-ink font-medium" style={num}>
        {value}
      </span>
    </div>
  );
}

export function SlipDialog({
  slip,
  onClose,
}: {
  slip: SlipData | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={slip !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {slip && (
          <>
            <DialogHeader>
              <DialogTitle>Issue slip {slip.slipNo}</DialogTitle>
              <DialogDescription>
                {new Date(slip.issuedAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="bg-surface flex flex-col items-start gap-1 rounded-xl p-4">
              <span className="text-ink-2 text-sm tracking-wide uppercase">
                Fine weight
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span
                  className="text-ink text-[40px] leading-[44px] font-semibold"
                  style={num}
                >
                  {grams(slip.fineMg)}
                </span>
                <span className="text-ink-2">g</span>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <Row
                label="Karigar"
                value={`${slip.karigarName} (${slip.karigarCode})`}
              />
              <Row label="Job number" value={slip.jobNumber} />
              <Row label="Item category" value={slip.category} />
              <Row label="Gross weight" value={`${grams(slip.grossMg)} g`} />
              <Row
                label="Purity"
                value={`${formatPurity(slip.purityH).replace(/\s*%$/, "")} %`}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
