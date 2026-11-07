"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGrams } from "@/lib/gold";
import type { getStock } from "@/lib/stock-query";

type Stock = Awaited<ReturnType<typeof getStock>>;

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Stock };

function StockResult({ asOn }: { asOn: string }) {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ asOn });

    async function load() {
      try {
        const response = await fetch(`/api/stock?${query}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Could not load stock.",
          );
        }

        const data: Stock = await response.json();

        if (!controller.signal.aborted) {
          setState({ status: "ready", data });
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Could not load stock.",
          });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [asOn, attempt]);

  if (state.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading stock" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="space-y-3 py-6">
        <p>{state.message}</p>
        <Button
          variant="outline"
          className="min-h-12"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const stock = state.data;
  const cards = [
    { label: "In-house stock", value: stock.inHouseStockMg },
    { label: "With karigars", value: stock.karigarStockMg },
    { label: "Total stock", value: stock.totalStockMg },
    { label: "Closed-job wastage", value: stock.closedWastageMg },
  ];

  return (
    <div className="space-y-6">
      <p className="text-ink-2 text-sm">
        As on {stock.asOn} · End of day · Asia/Kolkata · All weights are fine
        gold
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <section
            key={card.label}
            aria-label={card.label}
            className="border-line bg-surface rounded-2xl border p-6"
          >
            <h2 className="text-ink-2 text-sm">{card.label}</h2>
            <p className="mt-2 text-3xl font-semibold tracking-tight break-words tabular-nums">
              {formatGrams(card.value)}
            </p>
          </section>
        ))}
      </div>

      <p className="text-ink-2 text-sm">
        Total stock includes in-house stock and balances on open jobs.
        Closed-job wastage is shown separately and excluded from total stock.
        In-house stock is calculated from the opening vault amount and recorded
        ledger movements; it is not a physical stock count.
      </p>

      <section aria-labelledby="karigar-stock-heading" className="space-y-4">
        <h2 id="karigar-stock-heading" className="text-xl font-semibold">
          Stock with karigars
        </h2>

        {stock.karigars.length === 0 ? (
          <p className="text-ink-2 py-6">No karigars on or before this date.</p>
        ) : (
          <>
            <div className="border-line hidden overflow-x-auto rounded-xl border md:block">
              <Table className="text-base">
                <TableHeader>
                  <TableRow>
                    <TableHead>Karigar</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">
                      Fine-gold stock
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.karigars.map((karigar) => (
                    <TableRow key={karigar.id} className="h-14">
                      <TableCell className="whitespace-normal">
                        {karigar.name}
                      </TableCell>
                      <TableCell>{karigar.code}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatGrams(karigar.stockMg)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {stock.karigars.map((karigar) => (
                <article
                  key={karigar.id}
                  className="border-line space-y-3 rounded-xl border bg-white p-4"
                >
                  <div>
                    <h3 className="font-semibold break-words">
                      {karigar.name}
                    </h3>
                    <p className="text-ink-2 text-sm break-words">
                      {karigar.code}
                    </p>
                  </div>
                  <dl className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-2">Fine-gold stock</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatGrams(karigar.stockMg)}
                    </dd>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function StockView({ initialDate }: { initialDate: string }) {
  const [asOn, setAsOn] = useState(initialDate);

  return (
    <div className="min-w-0 space-y-6">
      <div className="max-w-xs space-y-2">
        <Label htmlFor="stock-date">As on (IST)</Label>
        <Input
          id="stock-date"
          type="date"
          min="1000-01-01"
          max="9999-12-31"
          value={asOn}
          onChange={(event) => setAsOn(event.target.value)}
          className="min-h-12"
        />
      </div>

      {!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(asOn) ? (
        <p className="text-ink-2">Choose a valid as-on date.</p>
      ) : (
        <StockResult key={asOn} asOn={asOn} />
      )}
    </div>
  );
}
