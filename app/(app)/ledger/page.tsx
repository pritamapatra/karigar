import { connection } from "next/server";
import { Suspense } from "react";
import { LedgerView } from "@/components/ledger-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { HttpError } from "@/lib/authz";

function LedgerLoading() {
  return (
    <div aria-busy="true" aria-label="Loading ledger" className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

async function LedgerScreen() {
  await connection();

  try {
    await requireRole("clerk", "finance", "partner");
  } catch (error) {
    if (error instanceof HttpError) {
      return <p role="alert">Your account cannot view this ledger.</p>;
    }
    throw error;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  const initialDate = `${value("year")}-${value("month")}-${value("day")}`;

  return <LedgerView initialDate={initialDate} />;
}

export default function Page() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
        Karigar ledger
      </h1>
      <Suspense fallback={<LedgerLoading />}>
        <LedgerScreen />
      </Suspense>
    </div>
  );
}
