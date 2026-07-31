"use client";

// Reactive workspace state shared across the header switcher, the account
// manager, История and the Hub. Single provider (mounted in providers.tsx) so
// switching the active workspace instantly re-filters every consumer.
//
// Persistence is client-side + per user id (see lib/workspaces). Credits are
// account-wide and intentionally not part of this context.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/lib/auth-context";
import { countMockProjects } from "@/lib/historyMock";
import {
  DEFAULT_WORKSPACE_NAME,
  newWorkspaceId,
  readActiveWorkspaceId,
  readProjectMap,
  readWorkspaces,
  writeActiveWorkspaceId,
  writeWorkspaces,
  type BrandKit,
  type Workspace,
} from "@/lib/workspaces";

const DEV = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

type WorkspaceContextValue = {
  ready: boolean;
  workspaces: Workspace[];
  activeId: string | null;
  active: Workspace | null;
  setActive: (id: string) => void;
  create: (name: string, logo?: string | null) => Workspace | null;
  update: (
    id: string,
    patch: { name?: string; logo?: string | null; brandKit?: BrandKit },
  ) => void;
  remove: (id: string) => void;
  /** Number of projects in a workspace (mock in the dev build; real tag-map otherwise). */
  projectCount: (id: string) => number;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function makeWorkspace(name: string, logo: string | null, agoDays = 0): Workspace {
  return {
    id: newWorkspaceId(),
    name,
    logo,
    createdAt: new Date(Date.now() - agoDays * 86_400_000).toISOString(),
  };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const uid = user?.id ?? null;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Load + self-heal on the signed-in user. Auto-creates a default space (and,
  // in the local dev build, a couple of example client spaces) so the feature
  // is usable and demoable the moment you land.
  useEffect(() => {
    if (!isAuthenticated) {
      setWorkspaces([]);
      setActiveId(null);
      setReady(false);
      return;
    }
    let list = readWorkspaces(uid);
    if (list.length === 0) {
      const def = makeWorkspace(DEFAULT_WORKSPACE_NAME, null, 0);
      list = DEV
        ? [def, makeWorkspace("Casino Royale", null, 6), makeWorkspace("BetStars", null, 2)]
        : [def];
      writeWorkspaces(uid, list);
    }
    let active = readActiveWorkspaceId(uid);
    if (!active || !list.some((w) => w.id === active)) {
      active = list[0].id;
      writeActiveWorkspaceId(uid, active);
    }
    setWorkspaces(list);
    setActiveId(active);
    setReady(true);
  }, [uid, isAuthenticated]);

  const setActive = useCallback(
    (id: string) => {
      setActiveId(id);
      writeActiveWorkspaceId(uid, id);
    },
    [uid],
  );

  const create = useCallback(
    (name: string, logo: string | null = null) => {
      const clean = name.trim();
      if (!clean) return null;
      const ws: Workspace = {
        id: newWorkspaceId(),
        name: clean,
        logo: logo ?? null,
        createdAt: new Date().toISOString(),
      };
      const next = [...workspaces, ws];
      setWorkspaces(next);
      writeWorkspaces(uid, next);
      return ws;
    },
    [workspaces, uid],
  );

  const update = useCallback(
    (id: string, patch: { name?: string; logo?: string | null; brandKit?: BrandKit }) => {
      const next = workspaces.map((w) =>
        w.id === id
          ? {
              ...w,
              name: patch.name !== undefined ? patch.name.trim() || w.name : w.name,
              logo: patch.logo !== undefined ? patch.logo : w.logo,
              brandKit: patch.brandKit !== undefined ? patch.brandKit : w.brandKit,
            }
          : w,
      );
      setWorkspaces(next);
      writeWorkspaces(uid, next);
    },
    [workspaces, uid],
  );

  const remove = useCallback(
    (id: string) => {
      // Always keep at least one space so the app is never workspace-less.
      if (workspaces.length <= 1) return;
      const next = workspaces.filter((w) => w.id !== id);
      setWorkspaces(next);
      writeWorkspaces(uid, next);
      if (activeId === id) {
        setActiveId(next[0].id);
        writeActiveWorkspaceId(uid, next[0].id);
      }
    },
    [workspaces, activeId, uid],
  );

  const projectCount = useCallback(
    (id: string) => {
      if (DEV) return countMockProjects(id);
      const m = readProjectMap(uid);
      return Object.values(m).filter((w) => w === id).length;
    },
    [uid],
  );

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({ ready, workspaces, activeId, active, setActive, create, update, remove, projectCount }),
    [ready, workspaces, activeId, active, setActive, create, update, remove, projectCount],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
