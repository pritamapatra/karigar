"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type Category = { id: string; name: string };
export type Karigar = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  wastage: { categoryId: string; wastageBp: number }[];
};

function bpToPercent(bp: number) {
  return `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, "0")}`;
}

function percentToBp(v: string): number | null {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return bp <= 2000 ? bp : null;
}

export function KarigarSheet({
  karigar,
  categories,
  canEdit,
  onOpenChange,
  onSaved,
}: {
  karigar: Karigar | null;
  categories: Category[];
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (k: Karigar) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      categories.map((c) => {
        const bp = karigar?.wastage.find(
          (w) => w.categoryId === c.id,
        )?.wastageBp;
        return [c.id, bp === undefined ? "" : bpToPercent(bp)];
      }),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!karigar) return;
    const wastage: { categoryId: string; wastageBp: number }[] = [];
    for (const c of categories) {
      const v = (values[c.id] ?? "").trim();
      if (!v) continue;
      const bp = percentToBp(v);
      if (bp === null) {
        setError(`${c.name}: enter a value from 0.00 to 20.00`);
        return;
      }
      wastage.push({ categoryId: c.id, wastageBp: bp });
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/karigars/${karigar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wastage }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data: { karigar: Karigar } = await res.json();
      onSaved(data.karigar);
      toast.success("Wastage saved");
      onOpenChange(false);
    } catch {
      toast.error("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={karigar !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        {karigar && (
          <>
            <SheetHeader>
              <SheetTitle>{karigar.name}</SheetTitle>
              <SheetDescription>
                {karigar.code}
                {canEdit ? "" : " - read-only"}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4">
              <p className="text-ink text-sm font-medium">
                Agreed wastage by category (%)
              </p>
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_7rem] items-center gap-3"
                >
                  <Label htmlFor={`w-${c.id}`}>{c.name}</Label>
                  <Input
                    id={`w-${c.id}`}
                    value={values[c.id] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [c.id]: e.target.value }))
                    }
                    placeholder="Not set"
                    inputMode="decimal"
                    readOnly={!canEdit}
                    className="text-right tabular-nums"
                  />
                </div>
              ))}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              {canEdit && (
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving" : "Save"}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
