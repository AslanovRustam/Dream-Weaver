// Server-side auth helpers for TanStack Start routes running on Cloudflare Workers.
//
// Convention:
//   The frontend stores a Supabase session in localStorage / cookies and sends
//   the access token on protected API calls via `Authorization: Bearer <jwt>`.
//   Server validates the token by calling Supabase auth.getUser, never trusting
//   the JWT payload blindly.
import { getAdminClient } from "./supabase/admin";
import { getUserClient } from "./supabase/user-client";

// TEMP (12.06.2026): личный gmail добавлен на время переезда на личный
// Supabase (корпоративный проект на паузе). Убрать при возврате.
export const SUPER_ADMIN_EMAILS = [
  "kela@clickable.agency",
  "skobelev@clickable.agency",
  "skobelev.victor.v@gmail.com",
  "aslanov@clickable.agency",
] as const;

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase() as (typeof SUPER_ADMIN_EMAILS)[number]);
}

export type AuthedUser = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  accessToken: string;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Resolve the calling user. Throws AuthError(401) if no/invalid token,
 * AuthError(500) if Supabase env is missing.
 */
export async function requireUser(request: Request): Promise<AuthedUser> {
  const token = extractBearer(request);
  if (!token) throw new AuthError("Missing Authorization Bearer token", 401);

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError("Invalid or expired token", 401);
  }
  const email = data.user.email ?? "";
  return {
    id: data.user.id,
    email,
    isSuperAdmin: isSuperAdminEmail(email),
    accessToken: token,
  };
}

/**
 * Like requireUser but additionally enforces super-admin email allow-list.
 * Throws AuthError(403) for non-admins.
 */
export async function requireSuperAdmin(request: Request): Promise<AuthedUser> {
  const user = await requireUser(request);
  if (!user.isSuperAdmin) {
    throw new AuthError("Super admin only", 403);
  }
  return user;
}

/**
 * Map AuthError (or any thrown error) into a JSON Response. Use inside
 * a handler's catch to keep route files small and consistent.
 */
export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("auth-server unexpected error", err);
  return Response.json(
    { error: err instanceof Error ? err.message : "Internal error" },
    { status: 500 },
  );
}

/** Re-export user-scoped client builder for routes that need RLS. */
export { getUserClient };
