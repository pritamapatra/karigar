"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertReviewButton } from "@/components/alert-review-button";

type Alert = {
  id: string;
  kind: "drift" | "over_allowance";
  baselineBp: number | null;
  actualBp: number;
  message: string;
  status: "new" | "reviewed";
  createdAt: string;
  karigar: { id: string; name: string; code: string };
  job: { id: string; jobNumber: string; closedAt: string | null };
};

type AlertsPage = {
  alerts: Alert[];
  page: number;
  pageSize: number;
  total: number;
  canReview: boolean;
};

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AlertsPage };

type StatusFilter = "new" | "reviewed" | "all";
type KindFilter = "drift" | "over_allowance" | "all";
type Query = {
  status: StatusFilter;
  kind: KindFilter;
  page: number;
};

function percent(bp: number): string {
  return `${Math.trunc(bp / 100)}.${String(bp % 100).padStart(2, "0")}%`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function AlertTimestamp({ value }: { value: string | null }) {
  if (value === null) return <>Not available</>;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>Not available</>;

  return (
    <time dateTime={date.toISOString()}>
      {dateTimeFormatter.format(date)} IST
    </time>
  );
}

export function AlertsView() {
  const [reviewLocked, setReviewLocked] = useState(false);
  const [query, setQuery] = useState<Query>({
    status: "new",
    kind: "all",
    page: 1,
  });

  return (
    <div className="min-w-0 space-y-6">
      <fieldset
        disabled={reviewLocked}
        aria-label="Alert filters"
        className="grid min-w-0 gap-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <label htmlFor="alert-status" className="block text-sm font-medium">
            Status
          </label>
          <select
            id="alert-status"
            value={query.status}
            className="bg-background min-h-12 w-full rounded-md border px-3"
            onChange={(event) =>
              setQuery((current) => ({
                ...current,
                status: event.target.value as StatusFilter,
                page: 1,
              }))
            }
          >
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="all">All statuses</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="alert-kind" className="block text-sm font-medium">
            Alert type
          </label>
          <select
            id="alert-kind"
            value={query.kind}
            className="bg-background min-h-12 w-full rounded-md border px-3"
            onChange={(event) =>
              setQuery((current) => ({
                ...current,
                kind: event.target.value as KindFilter,
                page: 1,
              }))
            }
          >
            <option value="all">All types</option>
            <option value="drift">Above usual range</option>
            <option value="over_allowance">Over allowance</option>
          </select>
        </div>
      </fieldset>
      {reviewLocked && (
        <p role="status" className="text-sm">
          Filters and pagination are paused until the review is confirmed or
          rejected.
        </p>
      )}
      <AlertsResult
        key={`${query.status}:${query.kind}:${query.page}`}
        {...query}
        reviewLocked={reviewLocked}
        onLockChange={setReviewLocked}
        onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
      />
    </div>
  );
}

function AlertsResult({
  status,
  kind,
  page,
  reviewLocked,
  onLockChange,
  onPageChange,
}: Query & {
  reviewLocked: boolean;
  onLockChange: (locked: boolean) => void;
  onPageChange: (page: number) => void;
}) {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "25",
        });
        if (status !== "all") params.set("status", status);
        if (kind !== "all") params.set("kind", kind);

        const response = await fetch(`/api/alerts?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Could not load alerts.",
          );
        }

        const data: AlertsPage = await response.json();
        if (!controller.signal.aborted) {
          setState({ status: "ready", data });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Could not load alerts.",
          });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [attempt, status, kind, page]);

  if (state.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading alerts" className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
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

  const { alerts, total, pageSize } = state.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-w-0 space-y-4">
      <p role="status">
        Showing {alerts.length} of {total} matching alerts · Page {page}
      </p>
      {alerts.length === 0 ? (
        <p className="py-8">
          {page > 1
            ? "No alerts on this page. Use Previous to return to earlier results."
            : status === "new"
              ? "Nothing to review"
              : "No alerts match these filters."}
        </p>
      ) : (
        <ul className="space-y-4" aria-label="Alerts">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <article className="min-w-0 space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    {alert.karigar.name} · {alert.karigar.code}
                  </h2>
                  <Badge variant="secondary">
                    {alert.kind === "drift"
                      ? "Above usual range"
                      : "Over allowance"}
                  </Badge>
                  <Badge variant="outline">
                    {alert.status === "new" ? "New" : "Reviewed"}
                  </Badge>
                </div>
                <p className="break-words">{alert.message}</p>
                <p className="break-words">Job {alert.job.jobNumber}</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt>Unexplained loss / issued fine gold</dt>
                    <dd className="tabular-nums">{percent(alert.actualBp)}</dd>
                  </div>
                  <div>
                    <dt>Previous-job baseline</dt>
                    <dd className="tabular-nums">
                      {alert.baselineBp === null
                        ? "Not available"
                        : percent(alert.baselineBp)}
                    </dd>
                  </div>
                  <div>
                    <dt>Alert created</dt>
                    <dd className="tabular-nums">
                      <AlertTimestamp value={alert.createdAt} />
                    </dd>
                  </div>
                  <div>
                    <dt>Job closed</dt>
                    <dd className="tabular-nums">
                      <AlertTimestamp value={alert.job.closedAt} />
                    </dd>
                  </div>
                </dl>
                {state.data.canReview && alert.status === "new" && (
                  <AlertReviewButton
                    alertId={alert.id}
                    disabled={reviewLocked}
                    onLockChange={onLockChange}
                    onSuccess={() => {
                      setState({ status: "loading" });
                      setAttempt((value) => value + 1);
                    }}
                  />
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
      <nav
        aria-label="Alert pages"
        className="flex flex-wrap items-center gap-3"
      >
        <Button
          variant="outline"
          className="min-h-12"
          disabled={reviewLocked || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          className="min-h-12"
          disabled={reviewLocked || page >= 10000 || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </nav>
    </div>
  );
}
