"use client";

// Standalone "Рабочее пространство" section (moved out of the header + account).
// Manage the user's company/client spaces: list, create, rename, delete, and
// set the active one. Client-side + per account (see lib/workspaces). Credits
// stay account-wide; only projects / history / stats are isolated per space.
//
// Single accent per control: this screen is VIOLET (fills + outlines + glow) —
// never mixed with lime — matching the workspace identity used elsewhere.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Briefcase, ChevronLeft, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/AppHeader";
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
    document.title = "Рабочее пространство — Dream Weaver Studio";
  }, []);
  const { isGuest } = useAppRole();

  if (isGuest) {
    return (
      <div className="relative min-h-screen">
        <div className="ds-aurora" aria-hidden />
        <AppHeader />
        <div className="relative z-10">
          <GuestWall
            title="Рабочие пространства доступны после регистрации"
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
        <Link
          href="/account"
          className="ds-btn ds-btn-outline-violet mb-8 min-h-11 gap-1.5 px-3"
        >
          <ChevronLeft className="h-4 w-4" />В аккаунт
        </Link>

        <header className="mb-6 flex items-center gap-3">
          <span className="ds-feature-icon ds-feature-icon-violet h-11 w-11 shrink-0">
            <Briefcase className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="ds-h1">Рабочие пространства</h1>
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

  return (
    <>
      <div className="ds-card ds-card-glow-violet p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                className={`rounded-xl border p-4 transition ${
                  active
                    ? "border-[color:var(--brand-violet)]/50 bg-[color:var(--brand-violet)]/[0.08]"
                    : "border-border bg-background/40 hover:border-white/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <WorkspaceAvatar ws={w} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{w.name}</p>
                      {active ? (
                        <span className="ds-pill shrink-0 bg-[color:var(--brand-violet)]/15 text-[color:var(--violet-400)]">
                          <span className="ds-dot" />
                          Активно
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 ds-caption">
                      {count} {pluralWs(count, "проект", "проекта", "проектов")} · создано {created}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {active ? (
                    <span className="ds-btn min-h-9 cursor-default px-3 text-sm text-muted-foreground">
                      Текущее
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActive(w.id)}
                      className="ds-btn ds-btn-outline-violet min-h-9 px-3 text-sm"
                    >
                      Сделать активным
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(w);
                      setFormOpen(true);
                    }}
                    aria-label="Переименовать"
                    title="Переименовать"
                    className="ds-btn ds-btn-ghost min-h-9 w-9 px-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(w)}
                    disabled={workspaces.length <= 1}
                    aria-label="Удалить"
                    title={
                      workspaces.length <= 1 ? "Нельзя удалить последнее пространство" : "Удалить"
                    }
                    className="ds-btn ds-btn-ghost min-h-9 w-9 px-0 text-muted-foreground hover:text-[color:var(--status-error)] disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
