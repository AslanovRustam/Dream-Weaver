"use client";

// /workspace/[id] — a single company/client space opened from the "Мой
// Workspace" list. Everything here is scoped to THIS space: its brand kit and
// its projects (isolated from other workspaces). Reuses История's project-card
// look (Preview + TypePills + formatRelative) and the app's violet workspace
// accent — no new visual pattern. Full settings live on /workspace/[id]/settings.
//
// Client-only for now: projects come from the workspace-seeded mock
// (getMockProjects(now, wsId)); a backend swaps that for /api/history?workspace=.

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  Coins,
  Globe,
  LayoutGrid,
  Loader2,
  Palette,
  Pencil,
  Plus,
  Settings,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { GuestWall } from "@/components/AuthGate";
import { WorkspaceAvatar } from "@/components/WorkspaceAvatar";
import { Preview, TypePills, formatRelative } from "@/components/HistoryApp";
import { useAppRole } from "@/lib/roles";
import { useWorkspace } from "@/lib/workspace-context";
import {
  getMockProjects,
  mockWorkspaceSpend,
  type Project,
  type ProjectType,
} from "@/lib/historyMock";
import { SECTION_BY_ID } from "@/lib/sections";
import type { Workspace } from "@/lib/workspaces";

// Languages offered for the brand kit (mirrors the generators' language field).
const LANGS: { value: string; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
];
const langLabel = (v?: string) => LANGS.find((l) => l.value === v)?.label ?? "Авто";

// Russian plural: 1 проект / 2 проекта / 5 проектов.
function pluralProjects(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "проект";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "проекта";
  return "проектов";
}

export default function WorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { isGuest } = useAppRole();
  const { ready, workspaces, activeId, setActive } = useWorkspace();

  const ws = useMemo(() => workspaces.find((w) => w.id === id) ?? null, [workspaces, id]);
  const active = ws?.id === activeId;

  useEffect(() => {
    document.title = ws ? `${ws.name} — Мой Workspace` : "Мой Workspace — Dream Weaver Studio";
  }, [ws?.name]);

  if (isGuest) {
    return (
      <Shell>
        <GuestWall
          title="«Мой Workspace» доступен после регистрации"
          description="Пространства для компаний и клиентов появятся здесь после создания аккаунта."
        />
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-brand-violet" /> Загрузка пространства…
        </div>
      </Shell>
    );
  }

  if (!ws) {
    return (
      <Shell>
        <div className="mx-auto mt-10 max-w-md text-center">
          <p className="ds-h4">Пространство не найдено</p>
          <p className="mt-1 ds-caption">Возможно, оно было удалено.</p>
          <BackButton href="/workspace" label="К списку пространств" className="mx-auto mt-5" />
        </div>
      </Shell>
    );
  }

  // Compact numeric date so the "Создано" metric card never truncates the year
  // on a narrow mobile card (e.g. 23.07.2026).
  const created = new Date(ws.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Shell>
      <BackButton href="/workspace" className="-ml-2 mb-6" />

      {/* Header: logo + name + activate/active + settings */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <WorkspaceAvatar ws={ws} size={56} />
          <div className="min-w-0">
            <h1 className="ds-h1 truncate">{ws.name}</h1>
            <p className="mt-0.5 ds-caption">Пространство клиента · проекты изолированы</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active ? (
            <span
              aria-label="Активное пространство"
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 px-1.5 text-sm font-medium text-[color:var(--violet-400)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              Активно
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setActive(ws.id)}
              className="ds-btn ds-btn-outline-violet min-h-10 shrink-0 gap-1.5 px-3.5"
            >
              <Check className="h-4 w-4" />
              Сделать активным
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(`/workspace/${ws.id}/settings`)}
            className="ds-btn ds-btn-violet min-h-10 shrink-0 gap-1.5 px-3.5"
          >
            <Settings className="h-4 w-4" />
            <span className="max-sm:hidden">Настройки пространства</span>
            <span className="sm:hidden">Настройки</span>
          </button>
        </div>
      </header>

      {/* Summary — compact metric cards */}
      <SummaryStats ws={ws} created={created} />

      {/* Brand kit */}
      <div className="mt-4">
        <BrandKitCard ws={ws} onEdit={() => router.push(`/workspace/${ws.id}/settings`)} />
      </div>

      {/* Projects */}
      <ProjectsSection
        ws={ws}
        onCreate={() => {
          setActive(ws.id);
          router.push("/");
        }}
        onOpen={(p) => {
          setActive(ws.id);
          const route = SECTION_BY_ID.get(p.type)!.route;
          router.push(p.real && p.type === "banner" ? `${route}?card=${p.id}` : route);
        }}
      />
    </Shell>
  );
}

// Page chrome shared by every state (guest / loading / not-found / ready).
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="ds-aurora" aria-hidden />
      <AppHeader />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}

// ── Summary: metric cards (project count / created / spent) ──────────────────
function SummaryStats({ ws, created }: { ws: Workspace; created: string }) {
  // Mock (workspace-seeded) until a backend stores the tag / usage log.
  const count = useMemo(
    () => getMockProjects(Date.now(), ws.id).filter((p) => !p.deleted).length,
    [ws.id],
  );
  const spent = useMemo(() => mockWorkspaceSpend(ws.id), [ws.id]);

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      <StatCard icon={LayoutGrid} label="Проектов" value={String(count)} />
      <StatCard icon={CalendarDays} label="Создано" value={created} small />
      <StatCard
        icon={Coins}
        label="Потрачено кредитов"
        value={String(spent)}
        suffix="кр."
        accentLime
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  small,
  accentLime,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  small?: boolean;
  accentLime?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`ds-card flex min-h-[104px] flex-col justify-between p-4 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${accentLime ? "text-brand-lime" : "text-brand-violet"}`} />
        <span className="ds-overline truncate">{label}</span>
      </div>
      <p
        className={`mt-2 truncate font-bold tracking-tight ${
          small ? "text-lg" : "text-2xl"
        } ${accentLime ? "ds-text-grad-lime" : "text-foreground"}`}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
    </div>
  );
}

// ── Brand kit ────────────────────────────────────────────────────────────────
function BrandKitCard({ ws, onEdit }: { ws: Workspace; onEdit: () => void }) {
  const [open, setOpen] = useState(true); // mobile accordion; always open on lg+
  const bk = ws.brandKit;
  const filled = !!(bk && (bk.brandName || (bk.colors && bk.colors.length) || bk.language));

  return (
    <div className="ds-card p-5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-muted-foreground lg:pointer-events-none"
        >
          <Palette className="h-4 w-4 text-brand-violet" />
          <span className="ds-overline">Бренд-кит клиента</span>
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="ds-btn ds-btn-outline-violet min-h-8 gap-1.5 px-2.5 text-xs"
        >
          <Pencil className="h-3.5 w-3.5" />
          {filled ? "Редактировать" : "Настроить"}
        </button>
      </div>

      <div className={open ? "mt-4" : "mt-4 hidden lg:block"}>
        {filled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <BkField label="Бренд">
              <div className="flex min-w-0 items-center gap-2.5">
                <WorkspaceAvatar ws={ws} size={32} />
                <span className="truncate text-sm font-medium text-foreground">
                  {bk!.brandName || ws.name}
                </span>
              </div>
            </BkField>
            <BkField label="Язык">
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <Globe className="h-4 w-4 text-brand-violet" />
                {langLabel(bk!.language)}
              </span>
            </BkField>
            <BkField label="Фирменные цвета">
              {bk!.colors && bk!.colors.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {bk!.colors.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      title={c}
                      className="h-6 w-6 rounded-md border border-white/15"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              ) : (
                <span className="ds-caption">не заданы</span>
              )}
            </BkField>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4">
            <p className="ds-caption">
              Задайте бренд, язык и цвета один раз — они подставятся по умолчанию в новые
              проекты этого клиента.
            </p>
            <button
              type="button"
              onClick={onEdit}
              className="ds-btn ds-btn-violet min-h-9 gap-1.5 px-3.5"
            >
              <Plus className="h-4 w-4" />
              Настроить бренд-кит
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BkField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="ds-label mb-1.5">{label}</p>
      {children}
    </div>
  );
}

// ── Projects ─────────────────────────────────────────────────────────────────
function ProjectsSection({
  ws,
  onCreate,
  onOpen,
}: {
  ws: Workspace;
  onCreate: () => void;
  onOpen: (p: Project) => void;
}) {
  const [type, setType] = useState<ProjectType | "all">("all");
  const [raw, setRaw] = useState<Project[] | null>(null);

  // Load in an effect so SSR/CSR time doesn't drift the relative dates.
  useEffect(() => {
    setRaw(getMockProjects(Date.now(), ws.id).filter((p) => !p.deleted));
  }, [ws.id]);

  const list = useMemo(() => {
    if (!raw) return [];
    return type === "all" ? raw : raw.filter((p) => p.type === type);
  }, [raw, type]);

  const total = raw?.length ?? 0;

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="ds-h4">Проекты</h2>
        {total > 0 ? (
          <button type="button" onClick={onCreate} className="ds-btn ds-btn-violet min-h-9 gap-1.5 px-3.5">
            <Plus className="h-4 w-4" />
            Создать проект
          </button>
        ) : null}
      </div>

      {/* Type filter — reused from История, horizontally scrollable on mobile. */}
      {total > 0 ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="w-max">
            <TypePills type={type} onType={setType} />
          </div>
        </div>
      ) : null}

      {raw === null ? (
        <div className="mt-6 flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-brand-violet" />
        </div>
      ) : total === 0 ? (
        // Empty workspace — friendly first-project prompt.
        <div className="mt-2 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--violet-tint)] text-brand-violet shadow-glow-violet">
            <LayoutGrid className="h-7 w-7" />
          </span>
          <div className="space-y-1">
            <p className="ds-h4">В этом пространстве пока нет проектов</p>
            <p className="ds-caption">
              Создайте первый проект — он автоматически привяжется к «{ws.name}».
            </p>
          </div>
          <button type="button" onClick={onCreate} className="ds-btn ds-btn-violet min-h-11 gap-1.5 px-4">
            <Plus className="h-4 w-4" />
            Создать первый проект
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center">
          <p className="text-sm font-medium">Ничего не найдено</p>
          <p className="ds-caption">В этом разделе пока нет проектов — выберите другой тип.</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <WorkspaceProjectCard key={p.id} p={p} onOpen={() => onOpen(p)} />
          ))}
        </div>
      )}
    </section>
  );
}

// Same card look as История's grid card (Preview + name + meta + relative date),
// trimmed to open-on-click for this read-focused view.
function WorkspaceProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-white/25"
    >
      <div className="relative aspect-[4/3] w-full">
        <Preview p={p} rounded="absolute inset-0" />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
        <p className="mt-0.5 truncate ds-caption">{p.meta}</p>
        <p className="ds-micro text-muted-foreground">{formatRelative(p.updatedAt)}</p>
      </div>
    </button>
  );
}
