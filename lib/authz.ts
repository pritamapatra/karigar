export type Role = "clerk" | "finance" | "partner" | "karigar";

export type ProfileRow = {
  id: string;
  orgId: string;
  role: Role;
  karigarId: string | null;
  displayName: string;
};

export type Session = ProfileRow & { userId: string };

export class HttpError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export function authorize(
  userId: string | null,
  profile: ProfileRow | null,
  allowed: readonly Role[],
): Session {
  if (!userId) throw new HttpError(401, "Sign in required");
  if (!profile || profile.id !== userId)
    throw new HttpError(403, "No access to this app");
  if (!allowed.includes(profile.role))
    throw new HttpError(403, "Your role cannot do this");
  return { ...profile, userId };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
