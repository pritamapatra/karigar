import { HttpError } from "@/lib/authz";
import type { Owner } from "./store";

export function assertRequestOwner(request: Request, owner: Owner) {
  const user = request.headers.get("X-Karigar-User");
  const org = request.headers.get("X-Karigar-Org");
  if (
    (user !== null && user !== owner.userId) ||
    (org !== null && org !== owner.orgId)
  ) {
    throw new HttpError(
      403,
      "Account changed. Sign in as the account that saved this entry.",
    );
  }
}
