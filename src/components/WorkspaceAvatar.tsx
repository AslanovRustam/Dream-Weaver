"use client";

import type { Workspace } from "@/lib/workspaces";

// Company logo, or a violet initial chip when none is set. Shared by the
// workspace section. Single-accent (violet) — no lime here.
export function WorkspaceAvatar({ ws, size = 22 }: { ws: Workspace | null; size?: number }) {
  const style = { width: size, height: size } as const;
  if (ws?.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ws.logo} alt="" className="shrink-0 rounded-md object-cover" style={style} />;
  }
  const letter = (ws?.name?.trim()?.[0] || "?").toUpperCase();
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{ ...style, backgroundImage: "var(--grad-violet)", fontSize: Math.round(size * 0.5) }}
    >
      {letter}
    </span>
  );
}
