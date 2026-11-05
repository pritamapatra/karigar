import { createClient } from "@supabase/supabase-js";
import type { PrismaClient } from "../../lib/generated/prisma/client";
import { ORG_ID } from "./org";

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Karigar@Demo1";

export const DEMO_USERS = [
  { email: "clerk.demo@example.com", role: "clerk", displayName: "Demo Clerk" },
  {
    email: "finance.demo@example.com",
    role: "finance",
    displayName: "Demo Finance Head",
  },
  {
    email: "partner.demo@example.com",
    role: "partner",
    displayName: "Demo Partner",
  },
] as const;

export async function seedUsers(db: PrismaClient) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Supabase URL or service role key is missing");

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    perPage: 200,
  });
  if (listError) throw listError;

  for (const user of DEMO_USERS) {
    let id = list.users.find((u) => u.email === user.email)?.id;
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user)
        throw error ?? new Error(`Could not create ${user.email}`);
      id = data.user.id;
    }
    await db.profile.upsert({
      where: { id },
      update: { role: user.role, displayName: user.displayName, orgId: ORG_ID },
      create: {
        id,
        orgId: ORG_ID,
        role: user.role,
        displayName: user.displayName,
      },
    });
  }
}
