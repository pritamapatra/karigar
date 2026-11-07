import { connection } from "next/server";
import { Suspense } from "react";
import { StockView } from "@/components/stock-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { HttpError } from "@/lib/authz";

function StockLoading() {
  return (
    <div aria-busy="true" aria-label="Loading stock" className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

async function StockScreen() {
  await connection();

  try {
    await requireRole("finance", "partner");
  } catch (error) {
    if (error instanceof HttpError) {
      return <p role="alert">Your account cannot view this stock statement.</p>;
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

  return <StockView initialDate={initialDate} />;
}

export default function Page() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
        Stock statement
      </h1>
      <Suspense fallback={<StockLoading />}>
        <StockScreen />
      </Suspense>
    </div>
  );
}
