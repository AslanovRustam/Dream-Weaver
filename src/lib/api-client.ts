// Fetch wrapper that auto-injects the Supabase access token.
// Use it from anywhere on the client — UI hooks, mutations, etc.
//
// We grab the token at call time (not once at startup) so the latest
// refreshed token is always used. If the user is not signed in we still
// allow the request to go through anonymously; protected server routes
// will respond 401 and the caller can react.
import { getBrowserClient } from "./supabase/browser";

export type ApiInit = RequestInit & {
  json?: unknown; // shortcut: pass an object, we set headers + stringify
};

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const supa = getBrowserClient();
    const { data } = await supa.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Force a session refresh (bypassing whatever local/racing state the SDK's
// background auto-refresh timer is in) and return the new token, if any.
// Used as a one-shot recovery when a request comes back 401 — long-running
// flows (e.g. a big resize batch) can outlive the access token's TTL, and a
// single stale-token 401 shouldn't need the user to sign in again.
async function forceRefreshToken(): Promise<string | undefined> {
  try {
    const supa = getBrowserClient();
    const { data } = await supa.auth.refreshSession();
    return data.session?.access_token;
  } catch {
    return undefined;
  }
}

async function doFetch(path: string, init: ApiInit, extraHeaders: Record<string, string>): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...extraHeaders,
  };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(init.json);
  }
  const { json: _omit, ...rest } = init;
  return fetch(path, { ...rest, headers, body });
}

export async function apiFetch(path: string, init: ApiInit = {}): Promise<Response> {
  const res = await doFetch(path, init, await authHeaders());
  // A 401 can mean a genuinely dead session, OR just an access token that
  // expired while a long-running flow (e.g. a resize batch) was still going —
  // getSession() only refreshes proactively on its own schedule, which can
  // race with a burst of concurrent requests. Force one real refresh and
  // retry once before giving up; a still-401 after that is a real sign-out.
  if (res.status === 401) {
    const token = await forceRefreshToken();
    if (token) {
      return doFetch(path, init, { Authorization: `Bearer ${token}` });
    }
  }
  return res;
}

export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** Parses JSON, throws ApiError if response is not OK. */
export async function apiJson<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    // A 401 means the session is gone/expired. The raw server text is English
    // and database-ish ("Invalid or expired token") — surface a clear, human
    // message instead so every protected screen can say "sign in again" rather
    // than showing what looks like a bug.
    if (res.status === 401) {
      throw new ApiError(401, "Сессия истекла. Войдите снова, чтобы продолжить.", parsed);
    }
    const message =
      (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status}`) || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, parsed);
  }
  return parsed as T;
}
