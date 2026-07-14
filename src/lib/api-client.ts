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

export async function apiFetch(path: string, init: ApiInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...(await authHeaders()),
  };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(init.json);
  }
  const { json: _omit, ...rest } = init;
  return fetch(path, { ...rest, headers, body });
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
    const message =
      (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status}`) || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, parsed);
  }
  return parsed as T;
}
