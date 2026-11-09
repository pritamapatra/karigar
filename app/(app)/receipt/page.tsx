import { Suspense } from "react";
import { connection } from "next/server";
import { ReceiptForm } from "@/components/receipt-form";
import { requireRole } from "@/lib/auth";

async function Content() {
  await connection();
  const { userId, orgId } = await requireRole("clerk", "finance");
  return <ReceiptForm key={`${orgId}:${userId}`} owner={{ userId, orgId }} />;
}

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-ink text-[28px] leading-[34px] font-semibold">
        New Receipt
      </h1>
      <Suspense fallback={<p role="status">Loading receipt form…</p>}>
        <Content />
      </Suspense>
    </div>
  );
}
