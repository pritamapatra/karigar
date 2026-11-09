import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ConnectivityStrip } from "@/components/connectivity-strip";
import { requireRole } from "@/lib/auth";
import { HttpError } from "@/lib/authz";
import { NAV_BY_ROLE } from "@/lib/roles";

async function RoleShell({ children }: { children: React.ReactNode }) {
  await connection();
  let session;
  try {
    session = await requireRole("clerk", "finance", "partner", "karigar");
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    if (error instanceof HttpError) {
      return (
        <main className="mx-auto max-w-md space-y-4 p-8">
          <p className="text-ink">Your account has no access to this app.</p>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-gold-ink underline">
              Sign out
            </button>
          </form>
        </main>
      );
    }
    throw error;
  }
  return (
    <AppShell items={NAV_BY_ROLE[session.role]}>
      <ConnectivityStrip
        key={`${session.orgId}:${session.userId}`}
        owner={{ userId: session.userId, orgId: session.orgId }}
        canWrite={session.role === "clerk" || session.role === "finance"}
      />
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <RoleShell>{children}</RoleShell>
    </Suspense>
  );
}
