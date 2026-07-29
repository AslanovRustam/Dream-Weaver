// Workspaces ("Рабочие пространства") — a Canva-style scope for keeping each
// company/client's projects, history and stats isolated from the others.
//
// CLIENT-ONLY for now: there is no workspace table on the backend yet, so the
// list, the active selection and the project→workspace tags live in
// localStorage, scoped per signed-in user id (same pattern as lib/onboarding).
// Everything is structured so a backend can take over later:
//   • projects carry a workspace id (here: a local tag map; later: a column),
//   • the History/Hub queries pass ?workspace=<id> for server-side filtering.
//
// Credits are deliberately NOT modelled here — they are account-wide (one
// balance per user, spent from any workspace). See the header credits chip.

export type Workspace = {
  id: string;
  name: string;
  logo: string | null; // data URL, optional
  createdAt: string; // ISO
};

const K_WS = (uid: string | null) => `dw:workspaces:${uid || "anon"}`;
const K_ACTIVE = (uid: string | null) => `dw:activeWorkspace:${uid || "anon"}`;
const K_PROJMAP = (uid: string | null) => `dw:projectWorkspace:${uid || "anon"}`;

/** Name of the space auto-created for a brand-new account so work is never
 *  blocked before the user makes their first workspace by hand. */
export const DEFAULT_WORKSPACE_NAME = "Личное пространство";

export function newWorkspaceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return "ws_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function isWorkspace(x: unknown): x is Workspace {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as Workspace).id === "string" &&
    typeof (x as Workspace).name === "string"
  );
}

export function readWorkspaces(uid: string | null): Workspace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(K_WS(uid));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr.filter(isWorkspace) as Workspace[]) : [];
  } catch {
    return [];
  }
}

export function writeWorkspaces(uid: string | null, list: Workspace[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(K_WS(uid), JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function readActiveWorkspaceId(uid: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(K_ACTIVE(uid));
  } catch {
    return null;
  }
}

export function writeActiveWorkspaceId(uid: string | null, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(K_ACTIVE(uid), id);
  } catch {
    /* ignore */
  }
}

// ── Project → workspace tags (forward-compatible with a backend column) ──────
export function readProjectMap(uid: string | null): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(K_PROJMAP(uid));
    const o: unknown = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Tag a (real) project with the workspace it was created in. */
export function tagProjectWorkspace(uid: string | null, projectId: string, workspaceId: string): void {
  if (typeof window === "undefined") return;
  try {
    const m = readProjectMap(uid);
    m[projectId] = workspaceId;
    window.localStorage.setItem(K_PROJMAP(uid), JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Which workspace a project belongs to; untagged/legacy projects fall back to
 *  the given default (so nothing ever silently disappears). */
export function projectWorkspaceId(
  uid: string | null,
  projectId: string,
  fallback: string,
): string {
  const m = readProjectMap(uid);
  return m[projectId] || fallback;
}
