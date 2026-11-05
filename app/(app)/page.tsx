import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { LANDING_BY_ROLE } from "@/lib/roles";

async function Landing() {
  const session = await requireRole("clerk", "finance", "partner", "karigar");
  return redirect(LANDING_BY_ROLE[session.role]);
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}
