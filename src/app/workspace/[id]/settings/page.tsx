"use client";

// /workspace/[id]/settings — a dedicated, structured settings screen for one
// space (kept OUT of the space's info page). Sections, top to bottom:
//   1. Основная информация — name + logo/avatar.
//   2. Brand Kit — client's brand defaults (name, language, colours).
//   3. Danger zone — delete, visually isolated, with type-the-name confirm
//      (GitHub/Notion pattern) so a client's projects are never lost by mistake.
// Back → the space page (not the list).

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Globe, Loader2, Palette, Plus, Trash2, Upload, X } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { GuestWall } from "@/components/AuthGate";
import { WorkspaceAvatar } from "@/components/WorkspaceAvatar";
import { Input } from "@/components/ui/input";
import { useAppRole } from "@/lib/roles";
import { useWorkspace } from "@/lib/workspace-context";

const LANGS: { value: string; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="ds-aurora" aria-hidden />
      <AppHeader />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-8">{children}</div>
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { isGuest } = useAppRole();
  const { ready, workspaces, update, remove } = useWorkspace();
  const ws = workspaces.find((w) => w.id === id) ?? null;

  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [language, setLanguage] = useState("auto");
  const [colors, setColors] = useState<string[]>([]);
  const [confirmName, setConfirmName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = ws ? `Настройки — ${ws.name}` : "Настройки пространства";
  }, [ws?.name]);

  // Hydrate the form once the space is available (context loads after mount).
  useEffect(() => {
    if (!ws) return;
    setName(ws.name);
    setLogo(ws.logo);
    setBrandName(ws.brandKit?.brandName ?? "");
    setLanguage(ws.brandKit?.language ?? "auto");
    setColors(ws.brandKit?.colors ?? []);
    setConfirmName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  if (isGuest) {
    return (
      <Shell>
        <GuestWall
          title="«Мой Workspace» доступен после регистрации"
          description="Настройки пространств появятся здесь после создания аккаунта."
        />
      </Shell>
    );
  }
  if (!ready) {
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-brand-violet" /> Загрузка…
        </div>
      </Shell>
    );
  }
  if (!ws) {
    return (
      <Shell>
        <div className="mx-auto mt-10 max-w-md text-center">
          <p className="ds-h4">Пространство не найдено</p>
          <BackButton href="/workspace" label="К списку пространств" className="mx-auto mt-5" />
        </div>
      </Shell>
    );
  }

  const canSave = name.trim().length > 0;
  const canDelete = workspaces.length > 1;
  const deleteArmed = confirmName.trim() === ws.name.trim();

  const save = () => {
    update(ws.id, {
      name: name.trim() || ws.name,
      logo,
      brandKit: { brandName: brandName.trim(), language, colors },
    });
    router.push(`/workspace/${ws.id}`);
  };

  const doDelete = () => {
    if (!deleteArmed || !canDelete) return;
    remove(ws.id);
    router.push("/workspace");
  };

  return (
    <Shell>
      <BackButton href={`/workspace/${ws.id}`} className="-ml-2 mb-6" />

      <header className="mb-6 flex items-center gap-3">
        <WorkspaceAvatar ws={{ ...ws, name: name || ws.name, logo }} size={44} />
        <div className="min-w-0">
          <h1 className="ds-h1">Настройки пространства</h1>
          <p className="mt-0.5 ds-caption truncate">{ws.name}</p>
        </div>
      </header>

      {/* 1 — Основная информация */}
      <section className="ds-card p-5 sm:p-6">
        <h2 className="ds-h4">Основная информация</h2>
        <p className="mt-1 ds-caption">Название и логотип пространства.</p>

        <div className="mt-5 flex items-center gap-4">
          <WorkspaceAvatar ws={{ ...ws, name: name || ws.name, logo }} size={64} />
          <div className="flex flex-col items-start gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="ds-btn ds-btn-outline-violet min-h-9 gap-2 px-3 text-sm"
            >
              <Upload className="h-4 w-4" />
              {logo ? "Заменить лого" : "Загрузить лого"}
            </button>
            {logo ? (
              <button
                type="button"
                onClick={() => setLogo(null)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Убрать лого
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

        <div className="mt-5 max-w-md">
          <label className="ds-label mb-2 block">Название пространства</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Casino Royale" />
        </div>
      </section>

      {/* 2 — Brand Kit */}
      <section className="ds-card mt-4 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Palette className="h-4 w-4 text-brand-violet" />
          <h2 className="ds-h4 text-foreground">Бренд-кит</h2>
        </div>
        <p className="mt-1 ds-caption">
          Данные клиента, которые подставляются по умолчанию в новые проекты этого пространства.
        </p>

        <div className="mt-5 max-w-md">
          <label className="ds-label mb-2 block">Название бренда</label>
          <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Бренд клиента" />
        </div>

        <div className="mt-5">
          <label className="ds-label mb-2 block">Основной язык</label>
          <div className="flex flex-wrap gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLanguage(l.value)}
                className={
                  language === l.value
                    ? "ds-btn ds-btn-violet min-h-9 px-3 text-sm"
                    : "min-h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  {l.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <label className="ds-label mb-2 block">Фирменные цвета</label>
          <div className="flex flex-wrap items-center gap-2">
            {colors.map((c, i) => (
              <span key={i} className="relative">
                <input
                  type="color"
                  value={c}
                  onChange={(e) => setColors((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))}
                  className="h-9 w-9 cursor-pointer rounded-md border border-white/15 bg-transparent p-0"
                  aria-label={`Цвет ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setColors((prev) => prev.filter((_, xi) => xi !== i))}
                  aria-label="Удалить цвет"
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[color:var(--status-error)] text-white"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {colors.length < 6 ? (
              <button
                type="button"
                onClick={() => setColors((prev) => [...prev, "#7b5cff"])}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition hover:border-white/30 hover:text-foreground"
                aria-label="Добавить цвет"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Save / cancel for sections 1–2 */}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push(`/workspace/${ws.id}`)}
          className="ds-btn ds-btn-ghost min-h-11 px-5"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={save}
          className="ds-btn ds-btn-violet min-h-11 px-6"
        >
          Сохранить
        </button>
      </div>

      {/* 3 — Danger zone (isolated at the bottom) */}
      <section className="mt-10 rounded-2xl border border-[color:var(--status-error)]/35 bg-[color:var(--status-error)]/[0.04] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[color:var(--status-error)]">
          <AlertTriangle className="h-4 w-4" />
          <span className="ds-overline">Опасная зона</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">
          Удалить пространство «{ws.name}»
        </p>
        <p className="mt-1 ds-caption">
          Пространство и все проекты внутри будут удалены безвозвратно. Действие нельзя отменить.
        </p>

        {canDelete ? (
          <div className="mt-4 max-w-md">
            <label className="ds-label mb-1.5 block">
              Введите <span className="font-semibold text-foreground">{ws.name}</span> для подтверждения
            </label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={ws.name}
            />
            <button
              type="button"
              disabled={!deleteArmed}
              onClick={doDelete}
              className="ds-btn mt-3 min-h-11 gap-1.5 px-5 font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: "var(--status-error)" }}
            >
              <Trash2 className="h-4 w-4" />
              Удалить пространство
            </button>
          </div>
        ) : (
          <p className="mt-3 ds-micro text-muted-foreground">
            Нельзя удалить последнее пространство — сначала создайте другое.
          </p>
        )}
      </section>
    </Shell>
  );
}
