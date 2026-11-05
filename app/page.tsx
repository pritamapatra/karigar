import Link from "next/link";
import { Suspense } from "react";
import { getUser } from "@/lib/supabase/server";

async function Who() {
  const user = await getUser();
  return (
    <p className="text-ink">
      {user ? `Signed in as ${user.email}` : "Not signed in"}
    </p>
  );
}

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-8">
      <Suspense fallback={<p className="text-ink-2">Loading...</p>}>
        <Who />
      </Suspense>
      <Link href="/login" className="text-gold-ink underline">
        Go to sign in
      </Link>
    </main>
  );
}
