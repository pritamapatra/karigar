import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Sign in | Karigar" };

const DEMO = [
  ["Clerk", "clerk.demo@example.com"],
  ["Finance", "finance.demo@example.com"],
  ["Partner", "partner.demo@example.com"],
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <span className="bg-gold h-8 w-8 rounded-xl" aria-hidden="true" />
          <span className="text-ink text-[28px] leading-[34px] font-semibold">
            Karigar
          </span>
        </div>
        <div className="border-line bg-surface rounded-2xl border p-6">
          <h1 className="text-ink mb-5 text-xl leading-[26px] font-semibold">
            Sign in
          </h1>
          <LoginForm />
        </div>
        <div className="text-ink-2 space-y-1 text-sm">
          <p className="text-ink font-medium">Demo accounts</p>
          {DEMO.map(([role, email]) => (
            <p key={role}>
              {role}: {email}
            </p>
          ))}
          <p>Password: Karigar@Demo1</p>
        </div>
      </div>
    </main>
  );
}
