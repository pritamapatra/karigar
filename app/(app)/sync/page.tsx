import { Suspense } from "react";
import { connection } from "next/server";
import { requireRole } from "@/lib/auth";
import { SyncReview } from "@/components/sync-review";

async function Content() {
  await connection();
  const { userId, orgId } = await requireRole("clerk", "finance");
  return <SyncReview owner={{ userId, orgId }} />;
}

export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
        Sync review
      </h1>
      <Suspense fallback={<p role="status">Loading sync review…</p>}>
        <Content />
      </Suspense>
    </div>
  );
}
