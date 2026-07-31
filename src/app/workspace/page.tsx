"use client";

// Standalone "Мой Workspace" section (full management; the header only has a
// quick-switcher). Moved out of the account page.
// Manage the user's company/client spaces: list, create, rename, delete, and
// set the active one. Client-side + per account (see lib/workspaces). Credits
// stay account-wide; only projects / history / stats are isolated per space.
//
// Single accent per control: this screen is VIOLET (fills + outlines + glow) —
// never mixed with lime — matching the workspace identity used elsewhere.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { GuestWall } from "@/components/AuthGate";
import { useAppRole } from "@/lib/roles";
import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceAvatar } from "@/components/WorkspaceAvatar";
import type { Workspace } from "@/lib/workspaces";

// Russian plural: 1 проект / 2 проекта / 5 проектов.
function pluralWs(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export default function WorkspacePage() {
  useEffect(() => {
    document.title = "Мой Workspace — Dream Weaver Studio";
  }, []);
  const { isGuest } = useAppRole();

  if (isGuest) {
    return (
      <div className="relative min-h-screen">
        <div className="ds-aurora" aria-hidden />
        <AppHeader />
        <div className="relative z-10">
          <GuestWall
            title="«Мой Workspace» доступен после регистрации"
            description="Создавайте пространства для компаний и клиентов после создания аккаунта."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="ds-aurora" aria-hidden />
      <AppHeader />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-8">
        <BackButton href="/account" className="-ml-2 mb-8" />

        <header className="mb-6 flex items-center gap-3">
          <span className="ds-feature-icon ds-feature-icon-violet h-11 w-11 shrink-0">
            <Briefcase className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="ds-h1">Мой Workspace</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Компании и клиенты — проекты, история и статистика изолированы по каждому пространству.
            </p>
          </div>
        </header>

        <WorkspacesManager />
      </div>
    </div>
  );
}

function WorkspacesManager() {
  const { workspaces, activeId, setActive, create, update, remove, projectCount } = useWorkspace();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);

  // Opened from the header dropdown's "Создать пространство" (…?new=1): open the
  // create form immediately, then strip the param so a refresh doesn't reopen it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === null) return;
    setEditing(null);
    setFormOpen(true);
    url.searchParams.delete("new");
    window.history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
  }, []);

  return (
    <>
      <div className="ds-card ds-card-glow-violet overflow-hidden">
        {/* Header bar: count + create (create/rename/delete stay here, not in
            the header quick-switcher). */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3.5 sm:px-5">
          <p className="ds-caption">
            {workspaces.length} {pluralWs(workspaces.length, "пространство", "пространства", "пространств")}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="ds-btn ds-btn-violet min-h-9 gap-1.5 px-3.5"
          >
            <Plus className="h-4 w-4" />
            Создать
          </button>
        </div>

        {/* LIST view — full-width rows (not cards), dividers + custom scroll. On
            mobile the row stacks so all three actions stay visible. */}
        <div className="max-h-[62vh] divide-y divide-[color:var(--border-subtle)] overflow-y-auto">
          {workspaces.map((w) => {
            const count = projectCount(w.id);
            const active = w.id === activeId;
            const created = new Date(w.createdAt).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            return (
              <div
                key={w.id}
                className={`flex items-center justify-between gap-3 px-4 py-3.5 transition sm:px-5 ${
                  active ? "bg-[color:var(--brand-violet)]/[0.07]" : "hover:bg-white/[0.02]"
                }`}
              >
                {/* Left → open the workspace's own page (projects + brand kit). */}
                <Link
                  href={`/workspace/${w.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-violet)]/50"
                >
                  <WorkspaceAvatar ws={w} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground transition group-hover:text-white">
                      {w.name}
                    </p>
                    <p className="mt-0.5 truncate ds-caption">
                      {count} {pluralWs(count, "проект", "проекта", "проектов")} · создано {created}
                    </p>
                  </div>
                </Link>
                {/* Right cluster: the activate control + an overflow menu. Both
                    states share ONE slot: active → a static "Активно" indicator
                    (same outline geometry, non-interactive); inactive → the
                    "Сделать активным" button. On mobile both collapse to an icon
                    so the row stays compact. */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {active ? (
                    // Active = a STATUS, not an action: a plain accent label with
                    // a small dot — no button box / border / hover. Reads clearly
                    // as "already selected", distinct from the outlined button.
                    <span
                      aria-label="Активное пространство"
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 px-1.5 text-sm font-medium text-[color:var(--violet-400)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                      Активно
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActive(w.id)}
                      aria-label="Сделать активным"
                      title="Сделать активным"
                      className="ds-btn ds-btn-outline-violet min-h-9 shrink-0 gap-1.5 px-3 max-sm:w-9 max-sm:px-0"
                    >
                      <Check className="h-4 w-4 shrink-0" />
                      <span className="max-sm:hidden">Сделать активным</span>
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Ещё действия"
                        className="ds-btn ds-btn-ghost min-h-9 w-9 shrink-0 px-0"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={6}
                      className="w-52 rounded-xl border-border bg-popover p-1.5 text-foreground"
                    >
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(w);
                          setFormOpen(true);
                        }}
                        className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base"
                      >
                        <Pencil className="h-4 w-4" />
                        Переименовать
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={workspaces.length <= 1}
                        onClick={() => setDeleting(w)}
                        className="gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[color:var(--status-error)] focus:bg-[color:var(--status-error)]/10 focus:text-[color:var(--status-error)] max-sm:py-3 max-sm:text-base"
                      >
                        <Trash2 className="h-4 w-4" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WorkspaceFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={(name, logo) => {
          if (editing) update(editing.id, { name, logo });
          else {
            const ws = create(name, logo);
            if (ws) setActive(ws.id);
          }
          setFormOpen(false);
        }}
      />

      <DeleteWorkspaceModal
        ws={deleting}
        count={deleting ? projectCount(deleting.id) : 0}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}

// Create / rename a workspace — name (required) + optional logo (data URL).
function WorkspaceFormModal({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: Workspace | null;
  onClose: () => void;
  onSubmit: (name: string, logo: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setLogo(initial?.logo ?? null);
    }
  }, [open, initial]);

  const canSave = name.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="w-full max-w-md rounded-2xl border border-border bg-panel p-6"
      >
        <DialogTitle className="ds-h4">
          {initial ? "Переименовать пространство" : "Новое пространство"}
        </DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Название компании или клиента и, по желанию, логотип.
        </p>

        <div className="mt-5 flex items-center gap-4">
          <WorkspaceAvatar ws={{ id: "preview", name: name || "?", logo, createdAt: "" }} size={56} />
          <div className="flex flex-col items-start gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="ds-btn ds-btn-outline-violet min-h-10 gap-2 px-3 text-sm"
            >
              <Upload className="h-4 w-4" />
              {logo ? "Заменить логотип" : "Загрузить логотип"}
            </button>
            {logo ? (
              <button
                type="button"
                onClick={() => setLogo(null)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Убрать логотип
              </button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setLogo(String(reader.result));
              reader.readAsDataURL(f);
            }}
          />
        </div>

        <div className="mt-5">
          <label className="mb-2 block ds-label">Название</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: ООО «Ромашка»"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) onSubmit(name.trim(), logo);
            }}
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="ds-btn ds-btn-ghost min-h-11 px-5">
            Отмена
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSubmit(name.trim(), logo)}
            className="ds-btn ds-btn-violet min-h-11 px-5"
          >
            {initial ? "Сохранить" : "Создать"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Delete confirmation — warns that the projects inside are removed too.
function DeleteWorkspaceModal({
  ws,
  count,
  onClose,
  onConfirm,
}: {
  ws: Workspace | null;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={ws !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6"
      >
        <DialogTitle className="ds-h4">Удалить пространство?</DialogTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Пространство <span className="font-medium text-foreground">«{ws?.name}»</span> будет
          удалено
          {count > 0 ? (
            <> вместе со всеми проектами внутри ({count}&nbsp;{pluralWs(count, "проект", "проекта", "проектов")}).</>
          ) : (
            <> (внутри пока нет проектов).</>
          )}{" "}
          Действие необратимо.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="ds-btn ds-btn-ghost min-h-11 px-5">
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="ds-btn min-h-11 gap-1.5 px-5 font-semibold text-white"
            style={{ backgroundColor: "var(--status-error)" }}
          >
            <Trash2 className="h-4 w-4" />
            Удалить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
