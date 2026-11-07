import { connection } from "next/server";
import { Suspense } from "react";
import { AlertsView } from "@/components/alerts-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { HttpError } from "@/lib/authz";

async function AlertsScreen() {
  await connection();

  try {
    await requireRole("finance", "partner");
  } catch (error) {
    if (error instanceof HttpError) {
      return <p role="alert">Your account cannot view these alerts.</p>;
    }
    throw error;
  }

  return <AlertsView />;
}

export default function Page() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
          Review queue
        </h1>
        <p className="mt-2">
          Review jobs with loss above the agreed allowance or usual range.
        </p>
      </div>
      <Suspense
        fallback={
          <div
            aria-busy="true"
            aria-label="Loading alerts"
            className="space-y-4"
          >
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        }
      >
        <AlertsScreen />
      </Suspense>
    </div>
  );
}
