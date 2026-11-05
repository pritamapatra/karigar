"use client";

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

export function KarigarSheet({
  karigar,
  categories,
  onOpenChange,
}: {
  karigar: Karigar | null;
  categories: Category[];
  onOpenChange: (open: boolean) => void;
}) {
  const bpFor = (id: string) =>
    karigar?.wastage.find((w) => w.categoryId === id)?.wastageBp;

  return (
    <Sheet open={karigar !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        {karigar && (
          <>
            <SheetHeader>
              <SheetTitle>{karigar.name}</SheetTitle>
              <SheetDescription>{karigar.code}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4">
              <p className="text-ink text-sm font-medium">
                Agreed wastage by category (%)
              </p>
              {categories.map((c) => {
                const bp = bpFor(c.id);
                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-[1fr_7rem] items-center gap-3"
                  >
                    <Label htmlFor={`w-${c.id}`}>{c.name}</Label>
                    <Input
                      id={`w-${c.id}`}
                      key={`${karigar.id}-${c.id}`}
                      defaultValue={bp === undefined ? "" : bpToPercent(bp)}
                      placeholder="Not set"
                      inputMode="decimal"
                      className="text-right tabular-nums"
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
