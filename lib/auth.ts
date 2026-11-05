import { authorize, type Role, type Session } from "./authz";
import { getPrisma } from "./prisma";
import { getUser } from "./supabase/server";

export async function requireRole(...allowed: Role[]): Promise<Session> {
  const user = await getUser();
  const profile = user
    ? await getPrisma().profile.findUnique({ where: { id: user.id } })
    : null;
  return authorize(user?.id ?? null, profile, allowed);
}
