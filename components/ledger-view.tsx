"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGrams, formatPurity } from "@/lib/gold";
import { Badge } from "@/components/ui/badge";
import { CorrectionSheet } from "@/components/correction-sheet";

type Karigar = { id: string; name: string; code: string };
type Entry = {
  id: string;
  reversalId: string | null;
  reversesEntryId: string | null;
  reason: string | null;
  jobStatus: "open" | "closed";
  createdAt: string;
  slipNo: string;
  entryType:
    | "issue"
    | "receipt_piece"
    | "receipt_scrap"
    | "receipt_filings"
    | "correction";
  grossMg: number;
  purityH: number;
  fineMg: number;
  balanceMg: number;
};
type Ledger = {
  canCorrect: boolean;
  karigar: Karigar;
  asOn: string;
  timezone: string;
  balanceMg: number;
  entries: Entry[];
};
type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

const labels: Record<Entry["entryType"], string> = {
  issue: "Issue",
  receipt_piece: "Finished piece returned",
  receipt_scrap: "Scrap returned",
  receipt_filings: "Filings returned",
  correction: "Correction",
};
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.error === "string" ? body.error : "Could not load data.",
    );
  }
  return response.json();
}

function followEntry(event: MouseEvent<HTMLAnchorElement>) {
  const hash = event.currentTarget.hash;
  const target = document.getElementById(hash.slice(1));
  if (!target || target.getClientRects().length === 0) return;
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;

  event.preventDefault();
  window.history.replaceState(window.history.state, "", hash);
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: "instant",
  });
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading ledger" className="space-y-4">
      <Skeleton className="h-36 w-full" />
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 py-6">
      <p>{message}</p>
      <Button variant="outline" className="min-h-12" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

function LedgerResult({
  karigarId,
  asOn,
  onSheetOpenChange,
}: {
  karigarId: string;
  asOn: string;
  onSheetOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<Load<Ledger>>({ status: "loading" });
  const [selected, setSelected] = useState<Entry | null>(null);
  const [correctionPending, setCorrectionPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ karigarId, asOn });
    read<Ledger>(`/api/ledger?${query}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Could not load ledger.",
          });
      });
    return () => controller.abort();
  }, [karigarId, asOn, attempt]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error")
    return (
      <Failure
        message={state.message}
        retry={() => {
          setState({ status: "loading" });
          setAttempt((value) => value + 1);
        }}
      />
    );

  const ledger = state.data;

  function entryActions(row: Entry, prefix: string) {
    const reversal = row.reversalId
      ? ledger.entries.find((entry) => entry.id === row.reversalId)
      : null;
    const original = row.reversesEntryId
      ? ledger.entries.find((entry) => entry.id === row.reversesEntryId)
      : null;
    const canReverse =
      ledger.canCorrect &&
      row.entryType.startsWith("receipt_") &&
      row.jobStatus === "open" &&
      !row.reversalId;

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {reversal && (
          <>
            <Badge variant="secondary">Corrected</Badge>
            <a
              className="text-gold-ink underline"
              href={`#${prefix}-${reversal.id}`}
              onClick={followEntry}
            >
              Reversal {reversal.slipNo}
            </a>
          </>
        )}
        {original && (
          <a
            className="text-gold-ink underline"
            href={`#${prefix}-${original.id}`}
            onClick={followEntry}
          >
            Reverses {original.slipNo}
          </a>
        )}
        {row.reason && (
          <span className="max-w-xs break-words whitespace-normal">
            {row.reason}
          </span>
        )}
        {canReverse && (
          <Button
            variant="outline"
            className="min-h-12"
            onClick={() => {
              setSelected(row);
              onSheetOpenChange(true);
            }}
          >
            Correct
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {selected && (
        <CorrectionSheet
          key={selected.id}
          entry={selected}
          onPendingChange={setCorrectionPending}
          onOpenChange={(open) => {
            if (!open && !correctionPending) {
              setSelected(null);
              onSheetOpenChange(false);
            }
          }}
          onSaved={() => {
            setSelected(null);
            setCorrectionPending(false);
            onSheetOpenChange(false);
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        />
      )}
      <section
        aria-label="Fine-gold balance"
        className="border-line bg-surface rounded-2xl border p-6"
      >
        <h2 className="text-xl font-semibold">{ledger.karigar.name}</h2>
        <p className="text-ink-2 mt-1 text-sm">{ledger.karigar.code}</p>
        <p className="text-ink-2 mt-5 text-sm">Running fine-gold balance</p>
        <p className="mt-2 text-[40px] leading-[44px] font-semibold tracking-tight tabular-nums">
          {formatGrams(ledger.balanceMg)}
        </p>
        <p className="text-ink-2 mt-3 text-sm">
          As on {ledger.asOn} · End of day · Asia/Kolkata
        </p>
      </section>

      {ledger.entries.length === 0 ? (
        <p className="text-ink-2 py-6">
          No ledger entries on or before this date.
        </p>
      ) : (
        <>
          <div className="border-line hidden rounded-xl border md:block">
            <div className="max-h-[560px] overflow-auto">
              <Table className="text-base">
                <TableHeader className="bg-surface sticky top-0 z-10">
                  <TableRow>
                    {[
                      "Date (IST)",
                      "Txn",
                      "Type",
                      "Gross / Net",
                      "Purity",
                      "Fine",
                      "Balance",
                    ].map((label, index) => (
                      <TableHead
                        key={label}
                        className={index >= 3 ? "text-right" : ""}
                      >
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.entries.map((row) => (
                    <TableRow
                      key={row.id}
                      id={`desktop-${row.id}`}
                      className="h-14 scroll-mt-14"
                    >
                      <TableCell>
                        {dateFormat.format(new Date(row.createdAt))}
                      </TableCell>
                      <TableCell>{row.slipNo}</TableCell>
                      <TableCell className="whitespace-normal">
                        {labels[row.entryType]}
                        {entryActions(row, "desktop")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatGrams(row.grossMg)}
                        {row.entryType === "receipt_piece" ? " net" : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPurity(row.purityH)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatGrams(row.fineMg)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatGrams(row.balanceMg)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {ledger.entries.map((row) => (
              <article
                key={row.id}
                id={`phone-${row.id}`}
                className="border-line space-y-4 rounded-xl border bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">{row.slipNo}</h3>
                  <time dateTime={row.createdAt} className="text-ink-2 text-sm">
                    {dateFormat.format(new Date(row.createdAt))}
                  </time>
                </div>
                <div>
                  <p>{labels[row.entryType]}</p>
                  {entryActions(row, "phone")}
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-ink-2">
                    {row.entryType === "receipt_piece"
                      ? "Net weight"
                      : "Gross weight"}
                  </dt>
                  <dd className="text-right tabular-nums">
                    {formatGrams(row.grossMg)}
                  </dd>
                  <dt className="text-ink-2">Purity</dt>
                  <dd className="text-right tabular-nums">
                    {formatPurity(row.purityH)}
                  </dd>
                  <dt className="text-ink-2">Signed fine weight</dt>
                  <dd className="text-right tabular-nums">
                    {formatGrams(row.fineMg)}
                  </dd>
                  <dt className="text-ink-2">Running balance</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {formatGrams(row.balanceMg)}
                  </dd>
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function LedgerView({ initialDate }: { initialDate: string }) {
  const [state, setState] = useState<Load<Karigar[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [karigarId, setKarigarId] = useState("");
  const [asOn, setAsOn] = useState(initialDate);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    read<{ karigars: Karigar[] }>("/api/karigars", controller.signal)
      .then(({ karigars }) => {
        if (!controller.signal.aborted)
          setState({ status: "ready", data: karigars });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not load karigars.",
          });
      });
    return () => controller.abort();
  }, [attempt]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error")
    return (
      <Failure
        message={state.message}
        retry={() => {
          setState({ status: "loading" });
          setAttempt((value) => value + 1);
        }}
      />
    );
  if (state.data.length === 0)
    return (
      <p className="text-ink-2">
        No karigars yet. Ledger entries will appear after gold is issued.
      </p>
    );

  const items = state.data.map((row) => ({
    value: row.id,
    label: `${row.name} (${row.code})`,
  }));

  return (
    <div className="min-w-0 space-y-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="ledger-karigar">Karigar</Label>
          <Select
            value={karigarId || null}
            disabled={sheetOpen}
            onValueChange={(value) => setKarigarId(value ?? "")}
            items={items}
          >
            <SelectTrigger id="ledger-karigar" className="min-h-12 w-full">
              <SelectValue placeholder="Select a karigar" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ledger-date">As on (IST)</Label>
          <Input
            id="ledger-date"
            disabled={sheetOpen}
            type="date"
            min="1000-01-01"
            max="9999-12-31"
            value={asOn}
            onChange={(event) => setAsOn(event.target.value)}
            className="min-h-12"
          />
        </div>
      </div>
      {!karigarId ? (
        <p className="text-ink-2">Select a karigar to view their ledger.</p>
      ) : !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(asOn) ? (
        <p className="text-ink-2">Choose a valid as-on date.</p>
      ) : (
        <LedgerResult
          key={`${karigarId}:${asOn}`}
          onSheetOpenChange={setSheetOpen}
          karigarId={karigarId}
          asOn={asOn}
        />
      )}
    </div>
  );
}
