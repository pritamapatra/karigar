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
import { fineMg, formatGrams, unexplainedMg } from "@/lib/gold";
import { parseGramsToMg, parsePurityToH } from "@/lib/gold-input";

type Job = {
  id: string;
  jobNumber: string;
  karigar: { id: string; name: string; code: string };
  category: { id: string; name: string };
  issuedFineMg: number;
  balanceMg: number;
  wastageBp: number | null;
  allowedMg: number | null;
};

const types = [
  { value: "receipt_piece", label: "Finished piece" },
  { value: "receipt_scrap", label: "Scrap" },
  { value: "receipt_filings", label: "Filings" },
] as const;

type ReceiptType = (typeof types)[number]["value"];

export function ReceiptForm() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [jobId, setJobId] = useState("");
  const [entryType, setEntryType] = useState<ReceiptType>("receipt_piece");
  const [weight, setWeight] = useState("");
  const [purity, setPurity] = useState("");
  const [huid, setHuid] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/jobs", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ jobs: Job[] }>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setJobs(data.jobs);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  const job = jobs.find((row) => row.id === jobId);
  const weightMg = parseGramsToMg(weight);
  const purityH = parsePurityToH(purity);
  const returnedFineMg =
    weightMg !== null && purityH !== null ? fineMg(weightMg, purityH) : null;
  const remainingMg =
    job && returnedFineMg !== null ? job.balanceMg - returnedFineMg : null;
  const exceedsBalance = remainingMg !== null && remainingMg < 0;
  const unexplained =
    job?.allowedMg !== null &&
    job?.allowedMg !== undefined &&
    remainingMg !== null &&
    remainingMg >= 0
      ? unexplainedMg(remainingMg, job.allowedMg)
      : null;

  const canRecord = Boolean(
    job &&
    weightMg !== null &&
    purityH !== null &&
    returnedFineMg !== null &&
    returnedFineMg > 0 &&
    !exceedsBalance &&
    (entryType !== "receipt_piece" || huid.trim().length > 0),
  );

  async function recordReceipt() {
    if (inFlight.current || (!requestRef.current && !canRecord)) return;

    if (!requestRef.current) {
      requestRef.current = JSON.stringify({
        jobId,
        entryType,
        purityH,
        idempotencyKey: crypto.randomUUID(),
        ...(entryType === "receipt_piece"
          ? { netMg: weightMg, huid: huid.trim() }
          : { grossMg: weightMg }),
      });
    }

    inFlight.current = true;
    setBusy(true);
    setPending(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestRef.current,
      });

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          const body = await response.json().catch(() => null);
          requestRef.current = null;
          setPending(false);
          setSaveError(
            typeof body?.error === "string"
              ? body.error
              : "Receipt was rejected. Check the values and your session.",
          );
          return;
        }
        throw new Error("Receipt result is uncertain");
      }

      const result: {
        entry: { slipNo: string; jobId: string };
        jobBalanceMg: number;
      } = await response.json();

      setJobs((rows) =>
        rows.map((row) =>
          row.id === result.entry.jobId
            ? { ...row, balanceMg: result.jobBalanceMg }
            : row,
        ),
      );
      requestRef.current = null;
      setPending(false);
      setWeight("");
      setHuid("");
      toast.success(`Receipt recorded. Slip ${result.entry.slipNo}`);
    } catch {
      setSaveError(
        "Could not confirm the receipt. Retry the same request before changing the fields.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function closeSelectedJob() {
    if (
      !job ||
      job.allowedMg === null ||
      pending ||
      inFlight.current ||
      weight.trim() !== ""
    )
      return;

    const overAllowance = job.balanceMg > job.allowedMg;
    const message = [
      `Close job ${job.jobNumber} for ${job.karigar.name}?`,
      `Actual wastage: ${formatGrams(job.balanceMg)}`,
      `Allowed wastage: ${formatGrams(job.allowedMg)}`,
      overAllowance
        ? "Actual wastage exceeds the allowance. Close for review?"
        : "Further receipts will be blocked.",
    ].join("\n");
    if (!window.confirm(message)) return;

    inFlight.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/close`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Could not confirm job closure. Refresh to check its status.",
        );
      }
      const result: { wastage: { unexplainedMg: number } } =
        await response.json();
      setJobs((rows) => rows.filter((row) => row.id !== job.id));
      setJobId("");
      setWeight("");
      setPurity("");
      setHuid("");
      toast.success(
        `Job closed. Unexplained wastage: ${formatGrams(result.wastage.unexplainedMg)}`,
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not confirm job closure. Refresh to check its status.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div
        aria-busy="true"
        aria-label="Loading receipt form"
        className="space-y-4"
      >
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div role="alert" className="space-y-3">
        <p>Could not load open jobs.</p>
        <Button
          variant="outline"
          onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="text-ink-2">
        No open jobs. Issue gold before recording a receipt.
      </p>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12">
      <div className="border-line space-y-6 rounded-xl border bg-white p-6 lg:col-span-7">
        <fieldset disabled={busy || pending} className="space-y-6">
          <legend className="sr-only">Receipt details</legend>
          <div className="space-y-2">
            <Label htmlFor="receipt-job">Open job</Label>
            <Select
              value={jobId || null}
              onValueChange={(value) => setJobId(value ?? "")}
              items={jobs.map((row) => ({
                value: row.id,
                label: `${row.jobNumber} - ${row.karigar.name} (${row.karigar.code})`,
              }))}
            >
              <SelectTrigger id="receipt-job" className="min-h-12 w-full">
                <SelectValue placeholder="Select an open job" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.jobNumber} - {row.karigar.name} ({row.karigar.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {job && <p className="text-ink-2 text-sm">{job.category.name}</p>}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Receipt type</legend>
            <div className="flex flex-wrap gap-2">
              {types.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={entryType === type.value ? "default" : "outline"}
                  aria-pressed={entryType === type.value}
                  className="min-h-12"
                  onClick={() => setEntryType(type.value)}
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="receipt-weight">
                {entryType === "receipt_piece"
                  ? "Net weight (g)"
                  : "Gross weight (g)"}
              </Label>
              <Input
                id="receipt-weight"
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                className="min-h-12 text-right tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-purity">Purity (%)</Label>
              <Input
                id="receipt-purity"
                inputMode="decimal"
                value={purity}
                onChange={(event) => setPurity(event.target.value)}
                className="min-h-12 text-right tabular-nums"
              />
            </div>
          </div>

          {entryType === "receipt_piece" && (
            <div className="space-y-2">
              <Label htmlFor="receipt-huid">HUID</Label>
              <Input
                id="receipt-huid"
                value={huid}
                onChange={(event) => setHuid(event.target.value)}
                maxLength={64}
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
          className="min-h-12"
          disabled={busy || (!pending && !canRecord)}
          onClick={recordReceipt}
        >
          {busy ? "Recording" : pending ? "Retry receipt" : "Record receipt"}
        </Button>

        {job && !pending && (
          <div className="border-line space-y-2 border-t pt-4">
            <p className="text-ink-2 text-sm">
              Closing uses the recorded balance of {formatGrams(job.balanceMg)}.
              {weight.trim() !== ""
                ? " Record or clear the typed receipt weight first."
                : ""}
            </p>
            {job.allowedMg === null ? (
              <p className="text-ink-2 text-sm">
                Set this category wastage allowance in Karigars before closing.
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                disabled={busy || weight.trim() !== ""}
                onClick={closeSelectedJob}
              >
                {job.balanceMg > job.allowedMg
                  ? "Close job for review"
                  : "Close job"}
              </Button>
            )}
          </div>
        )}

        {exceedsBalance && (
          <p role="alert" className="text-alert-red">
            Receipt exceeds the job balance. Check the weight and purity.
          </p>
        )}
        {returnedFineMg === 0 && (
          <p role="alert" className="text-alert-red">
            Weight and purity must produce at least 1 mg of fine gold.
          </p>
        )}
      </div>

      <section
        aria-label="Receipt preview"
        className="bg-surface space-y-5 rounded-2xl p-6 lg:col-span-5"
      >
        <div>
          <h2 className="text-ink-2 text-sm font-medium">
            Returned fine weight
          </h2>
          <p className="text-ink mt-2 text-[40px] leading-[44px] font-semibold tabular-nums">
            {returnedFineMg === null ? "—" : formatGrams(returnedFineMg)}
          </p>
        </div>
        <dl className="space-y-3">
          <PreviewRow label="Current job balance" mg={job?.balanceMg ?? null} />
          <PreviewRow label="Remaining after receipt" mg={remainingMg} />
        </dl>
        <div className="grid grid-cols-2 gap-4 rounded-xl bg-white p-4">
          <div>
            <p className="text-ink-2 text-sm">Allowed wastage</p>
            <p className="mt-1 font-semibold tabular-nums">
              {job?.allowedMg == null ? "Not set" : formatGrams(job.allowedMg)}
            </p>
          </div>
          <div>
            <p className="text-ink-2 text-sm">Projected actual wastage</p>
            <p className="mt-1 font-semibold tabular-nums">
              {remainingMg === null || exceedsBalance
                ? "—"
                : formatGrams(remainingMg)}
            </p>
          </div>
        </div>
        <div>
          <p className="text-ink-2 text-sm">Projected unexplained wastage</p>
          <p className="mt-2 text-[40px] leading-[44px] font-semibold tabular-nums">
            {unexplained === null ? "—" : formatGrams(unexplained)}
          </p>
        </div>
      </section>
    </div>
  );
}

function PreviewRow({ label, mg }: { label: string; mg: number | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-semibold tabular-nums">
        {mg === null ? "—" : formatGrams(mg)}
      </dd>
    </div>
  );
}
