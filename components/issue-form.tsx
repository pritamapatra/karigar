"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fineMg, formatGrams } from "@/lib/gold";
import { parseGramsToMg, parsePurityToH } from "@/lib/gold-input";
import Link from "next/link";
import { SlipDialog, type SlipData } from "@/components/slip-dialog";
import { saveGate } from "@/lib/ai-reading";
import {
  ScalePhotoReader,
  type PhotoAttachment,
} from "@/components/scale-photo-reader";

type K = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  balanceMg: number;
};
type C = { id: string; name: string };

const num = { fontFeatureSettings: '"tnum" 1, "zero" 1' } as const;
const grams = (mg: number) => formatGrams(mg).replace(/\s*g$/, "");
const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const get = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
  );

function Figure({
  mg,
  className,
  sign,
}: {
  mg: number;
  className: string;
  sign?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={className} style={num}>
        {sign && mg > 0 ? "+" : ""}
        {grams(mg)}
      </span>
      <span className="text-ink-2 text-sm">g</span>
    </span>
  );
}

export function IssueForm() {
  const [data, setData] = useState<{ ks: K[]; cs: C[] } | "loading" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [karigarId, setKarigarId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [gross, setGross] = useState("");
  const [purity, setPurity] = useState("");
  const [saving, setSaving] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoAttachment | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoKey, setPhotoKey] = useState(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [slip, setSlip] = useState<SlipData | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([get("/api/karigars"), get("/api/categories")])
      .then(([k, c]: [{ karigars: K[] }, { categories: C[] }]) => {
        if (live)
          setData({ ks: k.karigars.filter((x) => x.active), cs: c.categories });
      })
      .catch(() => {
        if (live) setData("error");
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (data === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (data === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-8">
        <p className="text-ink">Could not load the issue form.</p>
        <Button
          variant="outline"
          onClick={() => {
            setData("loading");
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { ks, cs } = data;
  if (ks.length === 0 || cs.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-8">
        <p className="text-ink">
          {ks.length === 0
            ? "No active karigars yet. Add a karigar before issuing gold."
            : "No item categories found."}
        </p>
        {ks.length === 0 && (
          <Link href="/karigars" className="text-gold-ink underline">
            Go to Karigars
          </Link>
        )}
      </div>
    );
  }
  const karigar = ks.find((k) => k.id === karigarId);
  const grossMg = parseGramsToMg(gross);
  const purityH = parsePurityToH(purity);
  const fine =
    grossMg !== null && purityH !== null ? fineMg(grossMg, purityH) : null;
  const reading = photo?.reading;
  const aiMismatch = Boolean(
    reading &&
    (!saveGate({ typed: grossMg, reading: reading.weight }).allowed ||
      !saveGate({ typed: purityH, reading: reading.purity }).allowed),
  );
  const ready = Boolean(
    karigar &&
    categoryId &&
    jobNumber.trim().length >= 2 &&
    fine !== null &&
    fine > 0 &&
    !saving &&
    !photoBusy &&
    (!aiMismatch || overrideReason.trim().length > 0),
  );

  async function submit() {
    if (
      inFlight.current ||
      photoBusy ||
      !karigar ||
      (!requestRef.current && !ready)
    )
      return;

    if (!requestRef.current) {
      requestRef.current = JSON.stringify({
        karigarId,
        categoryId,
        jobNumber: jobNumber.trim(),
        grossMg,
        purityH,
        idempotencyKey: newKey(),
        ...(photo ? { photoId: photo.photoId } : {}),
        ...(photo?.aiReadingId ? { aiReadingId: photo.aiReadingId } : {}),
        ...(photo?.aiReadingId && overrideReason.trim()
          ? { overrideReason: overrideReason.trim() }
          : {}),
      });
    }

    inFlight.current = true;
    setSaving(true);
    setPending(true);
    setJobError(null);
    setSaveError(null);

    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestRef.current,
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          const body = await res.json().catch(() => null);
          requestRef.current = null;
          setPending(false);
          const message =
            typeof body?.error === "string"
              ? body.error
              : "Issue was rejected. Check the values and your session.";
          setSaveError(message);
          return;
        }
        throw new Error("Issue result is uncertain");
      }

      const out: {
        entry: {
          slipNo: string;
          jobNumber: string;
          grossMg: number;
          purityH: number;
          fineMg: number;
        };
        balanceMg: number;
      } = await res.json();

      setData({
        ks: ks.map((k) =>
          k.id === karigarId ? { ...k, balanceMg: out.balanceMg } : k,
        ),
        cs,
      });
      toast.success(`Issued. Slip ${out.entry.slipNo}`);
      setSlip({
        slipNo: out.entry.slipNo,
        issuedAt: new Date().toISOString(),
        karigarName: karigar.name,
        karigarCode: karigar.code,
        jobNumber: out.entry.jobNumber,
        category: cs.find((c) => c.id === categoryId)?.name ?? "",
        grossMg: out.entry.grossMg,
        purityH: out.entry.purityH,
        fineMg: out.entry.fineMg,
      });

      requestRef.current = null;
      setPending(false);
      setJobNumber("");
      setGross("");
      setPurity("");
      setPhoto(null);
      setOverrideReason("");
      setPhotoKey((value) => value + 1);
    } catch {
      setSaveError(
        "Could not confirm the issue. Retry the same request before changing the fields.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="border-line flex flex-col gap-6 rounded-xl border bg-white p-6 lg:col-span-7">
          <fieldset
            disabled={saving || pending || photoBusy}
            className="flex min-w-0 flex-col gap-6"
          >
            <legend className="sr-only">Issue details</legend>
            <div className="flex flex-col gap-2">
              <Label htmlFor="karigar">Karigar</Label>
              <Select
                value={karigarId || null}
                onValueChange={(v) => setKarigarId(v ?? "")}
                items={ks.map((k) => ({
                  value: k.id,
                  label: `${k.name} - ${k.code}`,
                }))}
              >
                <SelectTrigger id="karigar" className="min-h-12 w-full">
                  <SelectValue placeholder="Select a karigar" />
                </SelectTrigger>
                <SelectContent>
                  {ks.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name} - {k.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="job">Job number</Label>
                <Input
                  id="job"
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  className="min-h-12"
                  aria-invalid={jobError !== null}
                />
                {jobError && (
                  <p role="alert" className="text-alert-red text-sm">
                    {jobError}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="category">Item category</Label>
                <Select
                  value={categoryId || null}
                  onValueChange={(v) => setCategoryId(v ?? "")}
                  items={cs.map((c) => ({ value: c.id, label: c.name }))}
                >
                  <SelectTrigger id="category" className="min-h-12 w-full">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {cs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gross">Gross weight (g)</Label>
                <Input
                  id="gross"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                  inputMode="decimal"
                  placeholder="120.000"
                  className="min-h-12 text-right text-xl font-semibold"
                  style={num}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="purity">Purity (%)</Label>
                <Input
                  id="purity"
                  value={purity}
                  onChange={(e) => setPurity(e.target.value)}
                  inputMode="decimal"
                  placeholder="91.60"
                  className="min-h-12 text-right text-xl font-semibold"
                  style={num}
                />
              </div>
            </div>

            <ScalePhotoReader
              key={photoKey}
              disabled={saving || pending}
              typedWeight={grossMg}
              typedPurity={purityH}
              onBusyChange={setPhotoBusy}
              onChange={(attachment) => {
                setPhoto(attachment);
                setOverrideReason("");
              }}
              onUseReading={(value) => {
                if (
                  value.weight.state === "ok" &&
                  value.weight.value !== null
                ) {
                  setGross((value.weight.value / 1000).toFixed(3));
                }
                if (
                  value.purity.state === "ok" &&
                  value.purity.value !== null
                ) {
                  setPurity((value.purity.value / 100).toFixed(2));
                }
                setOverrideReason("");
              }}
            />
            {aiMismatch && (
              <div className="space-y-2">
                <p className="text-alert-amber text-sm">
                  Typed weight or purity differs from a high-confidence AI
                  suggestion. Check the photo and correct the values or explain
                  the override.
                </p>
                <Label htmlFor="issue-ai-override">Override reason</Label>
                <Input
                  id="issue-ai-override"
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  maxLength={500}
                  className="min-h-12"
                />
              </div>
            )}
          </fieldset>
          {saveError && (
            <p role="alert" className="text-alert-red text-sm">
              {saveError}
            </p>
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={saving || photoBusy || (!pending && !ready)}
            className="min-h-12"
          >
            {saving ? "Issuing" : pending ? "Retry issue" : "Issue gold"}
          </Button>
        </div>

        <div className="bg-surface flex flex-col gap-4 rounded-2xl p-6 lg:col-span-5">
          <p className="text-ink-2 text-sm font-medium tracking-wide uppercase">
            Fine weight
          </p>
          <div className="rounded-xl bg-white p-4">
            {fine === null ? (
              <span
                className="text-ink-2 text-[40px] leading-[44px] font-semibold"
                style={num}
              >
                0.000
              </span>
            ) : (
              <Figure
                mg={fine}
                className="text-ink text-[40px] leading-[44px] font-semibold"
              />
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-2">Current balance</span>
              {karigar ? (
                <Figure
                  mg={karigar.balanceMg}
                  className="text-ink font-semibold"
                />
              ) : (
                <span className="text-ink-2">-</span>
              )}
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-ink-2">This issue</span>
              {fine !== null ? (
                <Figure
                  mg={fine}
                  sign
                  className="text-gold-ink font-semibold"
                />
              ) : (
                <span className="text-ink-2">-</span>
              )}
            </div>
            <div className="bg-line my-1 h-px" />
            <div className="flex items-baseline justify-between">
              <span className="text-ink font-semibold">
                Balance after issue
              </span>
              {karigar && fine !== null ? (
                <Figure
                  mg={karigar.balanceMg + fine}
                  className="text-ink text-xl font-semibold"
                />
              ) : (
                <span className="text-ink-2">-</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <SlipDialog slip={slip} onClose={() => setSlip(null)} />
    </>
  );
}
