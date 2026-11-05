"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KarigarSheet,
  type Category,
  type Karigar,
} from "@/components/karigar-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rows: Karigar[]; categories: Category[] };

export function KarigarList() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Karigar | null>(null);

  useEffect(() => {
    let live = true;
    const get = (url: string) =>
      fetch(url).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      );
    Promise.all([get("/api/karigars"), get("/api/categories")])
      .then(([k, c]: [{ karigars: Karigar[] }, { categories: Category[] }]) => {
        if (live)
          setState({
            status: "ready",
            rows: k.karigars,
            categories: c.categories,
          });
      })
      .catch(() => {
        if (live) setState({ status: "error" });
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return state.rows.filter(
      (k) =>
        !q ||
        k.name.toLowerCase().includes(q) ||
        k.code.toLowerCase().includes(q),
    );
  }, [state, query]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or code"
        aria-label="Search karigars"
        className="max-w-sm"
      />

      {state.status === "loading" && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 py-8">
          <p className="text-ink">Could not load karigars.</p>
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {state.status === "ready" && rows.length === 0 && (
        <p className="text-ink/60 py-8">
          {state.rows.length === 0
            ? "No karigars yet."
            : "No karigars match your search."}
        </p>
      )}

      {state.status === "ready" && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Categories set</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((k) => (
              <TableRow
                key={k.id}
                onClick={() => setSelected(k)}
                className="cursor-pointer"
              >
                <TableCell className="tabular-nums">{k.code}</TableCell>
                <TableCell>{k.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {k.wastage.length}
                </TableCell>
                <TableCell>
                  <Badge variant={k.active ? "default" : "secondary"}>
                    {k.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <KarigarSheet
        karigar={selected}
        categories={state.status === "ready" ? state.categories : []}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
