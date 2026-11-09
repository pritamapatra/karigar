import { Suspense } from "react";
import { connection } from "next/server";
import { IssueForm } from "@/components/issue-form";
import { requireRole } from "@/lib/auth";

async function Content() {
  await connection();
  const { userId, orgId } = await requireRole("clerk", "finance");
  return <IssueForm key={`${orgId}:${userId}`} owner={{ userId, orgId }} />;
}

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
        New Issue
      </h1>
      <Suspense fallback={<p role="status">Loading issue form…</p>}>
        <Content />
      </Suspense>
    </div>
  );
}
