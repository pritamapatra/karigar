"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type Errors = Partial<Record<"email" | "password" | "form", string>>;

export function LoginForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const parsed = schema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });

    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "email" ? "email" : "password";
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setLoading(true);
    const { error } = await createClient().auth.signInWithPassword(parsed.data);

    if (error) {
      setLoading(false);
      setErrors(
        error.status === 400
          ? { password: "Email or password is incorrect." }
          : { form: "Could not sign in. Check your connection and try again." },
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="h-12"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        {errors.email && (
          <p id="email-error" className="text-alert-red text-sm">
            {errors.email}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-12"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {errors.password && (
          <p id="password-error" className="text-alert-red text-sm">
            {errors.password}
          </p>
        )}
      </div>

      {errors.form && (
        <p role="alert" className="text-alert-red text-sm">
          {errors.form}
        </p>
      )}

      <Button type="submit" disabled={loading} className="h-12 w-full">
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
