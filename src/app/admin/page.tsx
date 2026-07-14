"use client";

// /admin — super-admin only panel.
//
// Two tabs:
//   - Users   : search profiles, grant/revoke credits with an audit note
//   - Pricing : edit coefficients per (model, quality), saved as one upsert
//
// Access control is enforced server-side; here we just hide UI for non-admins
// (the API will refuse anything sensitive with 403 regardless).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { apiJson, ApiError } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { ROLES, TIERS } from "@/lib/rbac";

type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
  phone: string;
  contact: string;
  credits_balance: number | string;
  role: string;
  tier: string;
  created_at: string;
};

type UsersResponse = { users: UserRow[]; total: number | null; limit: number; offset: number };

type PricingRow = {
  id: number;
  model: string;
  quality: "low" | "medium" | "high" | string;
  coefficient: number | string;
  updated_at: string;
  updated_by: string | null;
};

type SettingRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

type SettingFieldKind = "number" | "number_or_never" | "boolean" | "enum" | "string";
interface SettingFieldSpec {
  kind: SettingFieldKind;
  label: string;
  group: "retention" | "ftp" | "format" | "limits" | "ai";
  hint?: string;
  options?: string[];
}

// UI metadata for every supported app_settings key. Keys not listed
// here render as a read-only text row with a "недокументировано" hint.
const SETTING_SPECS: Record<string, SettingFieldSpec> = {
  retention_cards_months: {
    kind: "number",
    label: "Срок жизни карточек (мес)",
    group: "retention",
  },
  retention_logs_days: { kind: "number", label: "Срок жизни system_logs (дн)", group: "retention" },
  retention_audit_days: {
    kind: "number_or_never",
    label: "Срок жизни audit_logs (дн)",
    group: "retention",
    hint: "-1 = никогда не чистить",
  },
  card_delete_grace_hours: {
    kind: "number",
    label: "Окно восстановления удалённой карточки (ч)",
    group: "retention",
  },
  ftp_retry_max_attempts: { kind: "number", label: "Макс попыток FTP-аплоада", group: "ftp" },
  ftp_retry_max_hours: { kind: "number", label: "Дедлайн FTP-ретраев (ч)", group: "ftp" },
  crash_recovery_interval_minutes: {
    kind: "number",
    label: "Интервал воркера ретраев (мин)",
    group: "ftp",
    hint: "Сейчас требует рестарт сервера",
  },
  resize_format: {
    kind: "enum",
    label: "Формат ресайзов",
    group: "format",
    options: ["png", "jpg90", "jpg95"],
    hint: "Master всегда PNG",
  },
  bulk_zip_max_cards: {
    kind: "number",
    label: "Макс карточек в одном bulk-ZIP",
    group: "limits",
  },
  history_page_size: { kind: "number", label: "Размер страницы истории", group: "limits" },
  ai_naming_enabled: { kind: "boolean", label: "AI-имена карточек", group: "ai" },
  ai_naming_model: { kind: "string", label: "Модель для AI-имён", group: "ai" },
};

const GROUP_TITLES: Record<SettingFieldSpec["group"], string> = {
  retention: "Сроки хранения",
  ftp: "FTP / ретраи",
  format: "Формат вывода",
  limits: "Лимиты",
  ai: "AI-имена",
};

export default function AdminPage() {
  const router = useRouter();
  useEffect(() => { document.title = "Админ — Dream Weaver Studio"; }, []);
  const { isAuthenticated, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Cheap pre-check: ask /api/me, look at is_super_admin. The real wall is
  // server-side, this only avoids showing a broken page to non-admins.
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    apiJson<{ is_super_admin: boolean }>("/api/me")
      .then((r) => setIsAdmin(!!r.is_super_admin))
      .catch(() => setIsAdmin(false));
  }, [loading, isAuthenticated, router]);

  if (loading || isAdmin === null) {
    return <CenterMessage>Загрузка…</CenterMessage>;
  }
  if (!isAdmin) {
    return (
      <CenterMessage>
        <div className="space-y-3 text-center">
          <p>Эта страница доступна только супер-админам.</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/">На главную</Link>
          </Button>
        </div>
      </CenterMessage>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Админ-панель</h1>
            <p className="text-sm text-muted-foreground">Управление пользователями и тарифами</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">К генерации</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/account">Кабинет</Link>
            </Button>
          </div>
        </header>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Пользователи</TabsTrigger>
            <TabsTrigger value="histories">Истории</TabsTrigger>
            <TabsTrigger value="pricing">Тарифы</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
            <TabsTrigger value="logs">Логи</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
          <TabsContent value="histories" className="mt-4">
            <UserHistoriesTab />
          </TabsContent>
          <TabsContent value="pricing" className="mt-4">
            <PricingTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------
function UsersTab() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [target, setTarget] = useState<UserRow | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);

  // 300ms debounce so each keystroke doesn't smash the API.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async (search: string) => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("limit", "100");
      const data = await apiJson<UsersResponse>(`/api/admin/users?${params.toString()}`);
      setData(data);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пользователи</CardTitle>
        <CardDescription>Поиск по email, имени, фамилии, нику.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Input
            placeholder="Поиск…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
        </div>
        {err ? <p className="mb-2 text-sm text-destructive">{err}</p> : null}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Ник</TableHead>
                <TableHead>Контакт</TableHead>
                <TableHead>Роль · Тариф</TableHead>
                <TableHead className="text-right">Баланс</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : (data?.users ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Ничего не найдено
                  </TableCell>
                </TableRow>
              ) : (
                (data?.users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>
                      {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell>{u.nickname || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.contact || u.phone || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{u.role}</span>
                      <span className="text-muted-foreground"> · {u.tier}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(u.credits_balance).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setRoleTarget(u)}>
                          Роль
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTarget(u)}>
                          Кредиты
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CreditDialog
        user={target}
        onClose={(refresh) => {
          setTarget(null);
          if (refresh) load(debounced);
        }}
      />

      <RoleDialog
        user={roleTarget}
        onClose={(refresh) => {
          setRoleTarget(null);
          if (refresh) load(debounced);
        }}
      />
    </Card>
  );
}

function CreditDialog({
  user,
  onClose,
}: {
  user: UserRow | null;
  onClose: (refresh: boolean) => void;
}) {
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user) {
      setDelta("");
      setNote("");
      setErr("");
    }
  }, [user]);

  const open = !!user;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Изменить баланс</DialogTitle>
          <DialogDescription>
            {user ? user.email : ""} — текущий баланс{" "}
            <span className="font-medium">
              {user ? Number(user.credits_balance).toFixed(2) : ""}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="delta">Сумма (положительная — выдать, отрицательная — снять)</Label>
            <Input
              id="delta"
              type="number"
              step="any"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="например 100 или -50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Комментарий (необязательно)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="за что/почему"
            />
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={busy}>
            Отмена
          </Button>
          <Button
            disabled={busy || !user || !delta || Number(delta) === 0}
            onClick={async () => {
              if (!user) return;
              setErr("");
              setBusy(true);
              try {
                await apiJson("/api/admin/credits", {
                  method: "POST",
                  json: {
                    user_id: user.id,
                    delta: Number(delta),
                    note,
                  },
                });
                onClose(true);
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Не удалось применить");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Применяем…" : "Применить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// Role / tier assignment dialog (super-admin → /api/admin/role)
// ---------------------------------------------------------------------
function RoleDialog({
  user,
  onClose,
}: {
  user: UserRow | null;
  onClose: (refresh: boolean) => void;
}) {
  const [role, setRole] = useState("");
  const [tier, setTier] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setTier(user.tier);
      setErr("");
    }
  }, [user]);

  const open = !!user;
  const roleChanged = !!user && role !== user.role;
  const tierChanged = !!user && tier !== user.tier;
  const dirty = roleChanged || tierChanged;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Роль и тариф</DialogTitle>
          <DialogDescription>{user?.email ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-sel">Роль (права)</Label>
            <select
              id="role-sel"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tier-sel">Тариф (приоритет генерации)</Label>
            <select
              id="tier-sel"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {dirty && user ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
              <p className="mb-1 font-medium">Будет применено:</p>
              {roleChanged ? (
                <p>
                  роль: <span className="font-mono">{user.role}</span> →{" "}
                  <span className="font-mono">{role}</span>
                </p>
              ) : null}
              {tierChanged ? (
                <p>
                  тариф: <span className="font-mono">{user.tier}</span> →{" "}
                  <span className="font-mono">{tier}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={busy}>
            Отмена
          </Button>
          <Button
            disabled={busy || !dirty}
            onClick={async () => {
              if (!user) return;
              setErr("");
              setBusy(true);
              try {
                await apiJson("/api/admin/role", {
                  method: "POST",
                  json: {
                    user_id: user.id,
                    role: roleChanged ? role : undefined,
                    tier: tierChanged ? tier : undefined,
                  },
                });
                onClose(true);
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Не удалось применить");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Применяем…" : "Применить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// Pricing tab
// ---------------------------------------------------------------------
function PricingTab() {
  const [rows, setRows] = useState<PricingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await apiJson<{ items: PricingRow[] }>("/api/admin/pricing");
      setRows(data.items);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const out: Record<string, PricingRow[]> = {};
    (rows ?? []).forEach((r) => {
      (out[r.model] ||= []).push(r);
    });
    // Stable order within each model.
    const order = ["low", "medium", "high"];
    Object.values(out).forEach((arr) =>
      arr.sort((a, b) => order.indexOf(a.quality) - order.indexOf(b.quality)),
    );
    return out;
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Коэффициенты тарификации</CardTitle>
        <CardDescription>
          credits = total_tokens × coefficient. Значение 0.001 даёт пристойные целые числа кредитов
          за генерацию. Меняется без редеплоя.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {err ? <p className="mb-2 text-sm text-destructive">{err}</p> : null}
        {loading || !rows ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <div className="space-y-6">
            {Object.keys(grouped).map((model) => (
              <div key={model}>
                <h3 className="mb-2 text-sm font-medium">{model}</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {grouped[model].map((r) => (
                    <div key={r.id} className="space-y-1.5">
                      <Label htmlFor={`pr-${r.id}`} className="text-xs uppercase">
                        {r.quality}
                      </Label>
                      <Input
                        id={`pr-${r.id}`}
                        type="number"
                        step="any"
                        value={String(r.coefficient)}
                        onChange={(e) =>
                          setRows((prev) =>
                            (prev ?? []).map((x) =>
                              x.id === r.id ? { ...x, coefficient: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {ok ? <p className="text-sm text-emerald-500">{ok}</p> : null}
            <div>
              <Button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setErr("");
                  setOk("");
                  try {
                    const items = (rows ?? []).map((r) => ({
                      model: r.model,
                      quality: r.quality,
                      coefficient: Number(r.coefficient),
                    }));
                    await apiJson("/api/admin/pricing", {
                      method: "PUT",
                      json: { items },
                    });
                    setOk("Сохранено");
                    load();
                  } catch (e) {
                    setErr(e instanceof ApiError ? e.message : "Не удалось сохранить");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsTab() {
  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await apiJson<{ items: SettingRow[] }>("/api/admin/settings");
      setRows(data.items);
      const d: Record<string, unknown> = {};
      data.items.forEach((r) => {
        d[r.key] = r.value;
      });
      setDraft(d);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const out: Record<string, SettingRow[]> = {};
    (rows ?? []).forEach((r) => {
      const spec = SETTING_SPECS[r.key];
      const groupKey = spec ? GROUP_TITLES[spec.group] : "Прочее";
      (out[groupKey] ||= []).push(r);
    });
    return out;
  }, [rows]);

  const dirty = useMemo(() => {
    if (!rows) return [];
    const changed: Array<{ key: string; value: unknown }> = [];
    for (const r of rows) {
      const next = draft[r.key];
      if (JSON.stringify(next) !== JSON.stringify(r.value)) {
        changed.push({ key: r.key, value: next });
      }
    }
    return changed;
  }, [rows, draft]);

  const save = async () => {
    if (dirty.length === 0) return;
    setSaving(true);
    setErr("");
    setOk("");
    try {
      await apiJson("/api/admin/settings", { method: "PUT", json: { items: dirty } });
      setOk(`Сохранено: ${dirty.length}`);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройки приложения</CardTitle>
        <CardDescription>
          Каждое изменение пишется в audit_logs. Часть параметров (интервал воркера, формат
          ресайзов) применится после следующего рестарта/генерации.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
        {ok ? <p className="text-sm text-emerald-500">{ok}</p> : null}
        {loading || !rows ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            {Object.keys(grouped).map((groupTitle) => (
              <div key={groupTitle} className="space-y-3">
                <h3 className="text-sm font-medium">{groupTitle}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {grouped[groupTitle].map((row) => (
                    <SettingField
                      key={row.key}
                      row={row}
                      value={draft[row.key]}
                      onChange={(v) => setDraft((prev) => ({ ...prev, [row.key]: v }))}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <Button disabled={saving || dirty.length === 0} onClick={save}>
                {saving ? "Сохраняем…" : `Сохранить${dirty.length ? ` (${dirty.length})` : ""}`}
              </Button>
              {dirty.length > 0 && (
                <button
                  className="text-sm text-muted-foreground underline"
                  onClick={() => {
                    const d: Record<string, unknown> = {};
                    rows.forEach((r) => {
                      d[r.key] = r.value;
                    });
                    setDraft(d);
                  }}
                >
                  отменить
                </button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SettingField({
  row,
  value,
  onChange,
}: {
  row: SettingRow;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const spec = SETTING_SPECS[row.key];
  const label = spec?.label ?? row.key;

  let input: React.ReactNode;
  if (!spec) {
    input = (
      <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled />
    );
  } else if (spec.kind === "boolean") {
    input = (
      <div className="flex items-center gap-2">
        <input
          id={`s-${row.key}`}
          type="checkbox"
          className="size-4 accent-primary"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <Label htmlFor={`s-${row.key}`} className="text-sm font-normal">
          {value ? "включено" : "выключено"}
        </Label>
      </div>
    );
  } else if (spec.kind === "enum") {
    input = (
      <select
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      >
        {(spec.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (spec.kind === "string") {
    input = <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  } else {
    // number / number_or_never
    input = (
      <Input
        type="number"
        step="1"
        value={String(value ?? "")}
        onChange={(e) => {
          const n = e.target.value;
          onChange(n === "" ? null : Number(n));
        }}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${row.key}`} className="text-xs uppercase">
        {label}
      </Label>
      {input}
      {spec?.hint && <p className="text-xs text-muted-foreground">{spec.hint}</p>}
      {row.description && !spec?.hint && (
        <p className="text-xs text-muted-foreground">{row.description}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Logs tab — system_logs + audit_logs viewer
// ---------------------------------------------------------------------

type SystemLogRow = {
  id: number;
  level: "error" | "warn" | "info" | "debug" | string;
  category: string;
  message: string;
  context: Record<string, unknown> | null;
  user_id: string | null;
  request_id: string | null;
  duration_ms: number | null;
  error_stack: string | null;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  user_id: string | null;
  target_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

const SYSTEM_LEVELS = ["", "error", "warn", "info", "debug"];
const SYSTEM_CATEGORIES = ["", "ftp", "image-gen", "auth", "cron", "api", "admin"];

function LogsTab() {
  const [kind, setKind] = useState<"system" | "audit" | "tokens">("system");
  const tabs: { id: "system" | "audit" | "tokens"; label: string }[] = [
    { id: "system", label: "Система" },
    { id: "audit", label: "Аудит" },
    { id: "tokens", label: "Токены" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Логи</CardTitle>
        <CardDescription>
          Система — техника (errors, FTP, retention). Аудит — действия пользователей. Токены —
          расход токенов и кредитов по каждой генерации.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex w-fit rounded-md border p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={
                "rounded px-3 py-1 " +
                (kind === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground")
              }
              onClick={() => setKind(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {kind === "system" ? (
          <SystemLogsView />
        ) : kind === "audit" ? (
          <AuditLogsView />
        ) : (
          <TokensLogsView />
        )}
      </CardContent>
    </Card>
  );
}

function SystemLogsView() {
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<SystemLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (mode: "reset" | "append") => {
      setLoading(true);
      setErr("");
      try {
        const params = new URLSearchParams();
        params.set("kind", "system");
        params.set("limit", "50");
        params.set("offset", String(mode === "reset" ? 0 : offset));
        if (level) params.set("level", level);
        if (category) params.set("category", category);
        if (debouncedQ) params.set("q", debouncedQ);
        const data = await apiJson<{ items: SystemLogRow[]; total: number }>(
          `/api/admin/logs?${params.toString()}`,
        );
        if (mode === "reset") {
          setItems(data.items);
          setOffset(data.items.length);
        } else {
          setItems((p) => [...p, ...data.items]);
          setOffset((p) => p + data.items.length);
        }
        setTotal(data.total);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [level, category, debouncedQ, offset],
  );

  useEffect(() => {
    void load("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, category, debouncedQ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {SYSTEM_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l || "все уровни"}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {SYSTEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c || "все категории"}
            </option>
          ))}
        </select>
        <Input
          className="max-w-[300px]"
          placeholder="Поиск в message…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="ml-auto text-xs text-muted-foreground">Найдено: {total}</span>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="divide-y rounded-md border">
        {items.map((row) => {
          const isOpen = !!expanded[row.id];
          const hasDetails =
            (row.context && Object.keys(row.context).length > 0) || !!row.error_stack;
          return (
            <div key={row.id} className="px-3 py-2 text-sm">
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))}
              >
                <span
                  className={
                    "mt-0.5 inline-block rounded px-1.5 py-0.5 ds-micro font-semibold uppercase " +
                    levelClass(row.level)
                  }
                >
                  {row.level}
                </span>
                <span className="text-xs text-muted-foreground">{row.category}</span>
                <span className="flex-1 truncate font-mono text-xs">{row.message}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatTs(row.created_at)}
                </span>
              </button>
              {isOpen && hasDetails && (
                <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/30 p-2 text-xs">
                  {JSON.stringify(
                    {
                      context: row.context,
                      error_stack: row.error_stack,
                      user_id: row.user_id,
                      request_id: row.request_id,
                      duration_ms: row.duration_ms,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          );
        })}
        {items.length === 0 && !loading && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Записей нет.</p>
        )}
      </div>

      {offset < total && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => load("append")}>
          {loading ? "Загрузка…" : "Загрузить ещё"}
        </Button>
      )}
    </div>
  );
}

function AuditLogsView() {
  const [action, setAction] = useState("");
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(
    async (mode: "reset" | "append") => {
      setLoading(true);
      setErr("");
      try {
        const params = new URLSearchParams();
        params.set("kind", "audit");
        params.set("limit", "50");
        params.set("offset", String(mode === "reset" ? 0 : offset));
        if (action) params.set("action", action);
        const data = await apiJson<{ items: AuditLogRow[]; total: number }>(
          `/api/admin/logs?${params.toString()}`,
        );
        if (mode === "reset") {
          setItems(data.items);
          setOffset(data.items.length);
        } else {
          setItems((p) => [...p, ...data.items]);
          setOffset((p) => p + data.items.length);
        }
        setTotal(data.total);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [action, offset],
  );

  useEffect(() => {
    void load("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-[300px]"
          placeholder="Action (напр. card.deleted)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <span className="ml-auto text-xs text-muted-foreground">Найдено: {total}</span>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="divide-y rounded-md border">
        {items.map((row) => {
          const isOpen = !!expanded[row.id];
          return (
            <div key={row.id} className="px-3 py-2 text-sm">
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))}
              >
                <span className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono ds-micro">
                  {row.action}
                </span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {row.resource_type || ""}
                  {row.resource_id ? " · " + row.resource_id.slice(0, 12) : ""}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatTs(row.created_at)}
                </span>
              </button>
              {isOpen && (
                <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/30 p-2 text-xs">
                  {JSON.stringify(
                    {
                      user_id: row.user_id,
                      target_user_id: row.target_user_id,
                      details: row.details,
                      ip_address: row.ip_address,
                      user_agent: row.user_agent,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          );
        })}
        {items.length === 0 && !loading && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Записей нет.</p>
        )}
      </div>

      {offset < total && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => load("append")}>
          {loading ? "Загрузка…" : "Загрузить ещё"}
        </Button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Tokens tab — token + credit usage per generation event
// -----------------------------------------------------------------------

type TokenLogRow = {
  id: number;
  message: string;
  category: string;
  context: Record<string, unknown> | null;
  user_id: string | null;
  duration_ms: number | null;
  created_at: string;
};

const TOKEN_MSG_LABELS: Record<string, string> = {
  "master generated": "Мастер",
  "resize generated": "Ресайз",
  "vision pre-pass succeeded": "Vision",
  "card name polished": "AI-нейминг",
};

function TokensLogsView() {
  const [items, setItems] = useState<TokenLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msgFilter, setMsgFilter] = useState("");

  const load = useCallback(
    async (mode: "reset" | "append") => {
      setLoading(true);
      setErr("");
      try {
        const params = new URLSearchParams();
        params.set("kind", "tokens");
        params.set("limit", "50");
        params.set("offset", String(mode === "reset" ? 0 : offset));
        if (msgFilter) params.set("msg", msgFilter);
        const data = await apiJson<{ items: TokenLogRow[]; total: number; offset: number }>(
          `/api/admin/logs?${params.toString()}`,
        );
        setTotal(data.total);
        if (mode === "reset") {
          setItems(data.items);
          setOffset(data.items.length);
        } else {
          setItems((prev) => [...prev, ...data.items]);
          setOffset((prev) => prev + data.items.length);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    },
    [offset, msgFilter],
  );

  useEffect(() => {
    void load("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgFilter]);

  const ctx = (row: TokenLogRow) => row.context ?? {};

  const totalTokensSum = items.reduce((s, r) => s + (Number(ctx(r).total_tokens) || 0), 0);
  const totalChargeSum = items.reduce((s, r) => s + (Number(ctx(r).charge) || 0), 0);

  return (
    <div className="space-y-3">
      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={msgFilter}
          onChange={(e) => setMsgFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="">Все типы</option>
          {Object.entries(TOKEN_MSG_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load("reset")}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1 text-sm hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "…" : "Обновить"}
        </button>
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {total} событий · {totalTokensSum.toLocaleString()} токенов ·{" "}
          {totalChargeSum.toFixed(2)} кредитов
        </span>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[700px] text-xs">
          <thead>
            <tr className="border-b border-border bg-white/5 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Дата/время</th>
              <th className="px-3 py-2 font-medium">Тип</th>
              <th className="px-3 py-2 font-medium">Модель</th>
              <th className="px-3 py-2 font-medium">Кач-во</th>
              <th className="px-3 py-2 font-medium text-right" title="input_text_tokens / prompt_tokens">Вх. текст / промпт</th>
              <th className="px-3 py-2 font-medium text-right" title="input_image_tokens (только gpt-image-2)">Вх. изобр.</th>
              <th className="px-3 py-2 font-medium text-right" title="output_image_tokens / completion_tokens">Вых. изобр. / ответ</th>
              <th className="px-3 py-2 font-medium text-right">Итого</th>
              <th className="px-3 py-2 font-medium text-right">Кредиты</th>
              <th className="px-3 py-2 font-medium">User</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  Нет данных
                </td>
              </tr>
            )}
            {items.map((row) => {
              const c = ctx(row);
              const label = TOKEN_MSG_LABELS[row.message] ?? row.message;
              const model = String(c.model ?? "—");
              const quality = String(c.quality ?? "—");
              // gpt-image-2 logs input_text_tokens / input_image_tokens / output_image_tokens.
              // gpt-4o-mini (Vision, AI-нейминг) logs prompt_tokens / completion_tokens.
              // Show whichever is present.
              const isImageModel =
                row.message === "master generated" || row.message === "resize generated";
              const inText = isImageModel
                ? (c.input_text_tokens != null ? Number(c.input_text_tokens) : null)
                : (c.prompt_tokens != null ? Number(c.prompt_tokens) : null);
              const inImg = isImageModel
                ? (c.input_image_tokens != null ? Number(c.input_image_tokens) : null)
                : null;
              const outImg = isImageModel
                ? (c.output_image_tokens != null ? Number(c.output_image_tokens) : null)
                : (c.completion_tokens != null ? Number(c.completion_tokens) : null);
              const total = c.total_tokens != null ? Number(c.total_tokens) : null;
              const charge = c.charge != null ? Number(c.charge) : null;
              const typeColors: Record<string, string> = {
                Мастер: "bg-accent-green/20 text-accent-green",
                Ресайз: "bg-sky-500/20 text-sky-400",
                Vision: "bg-amber-500/20 text-amber-400",
                "AI-нейминг": "bg-purple-500/20 text-purple-400",
              };
              return (
                <tr key={row.id} className="border-b border-border/50 hover:bg-white/3">
                  <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                    {formatTs(row.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 ds-micro font-semibold " +
                        (typeColors[label] ?? "bg-white/10 text-white")
                      }
                    >
                      {label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{model}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">
                    {row.message === "card name polished" || row.message === "vision pre-pass succeeded"
                      ? "—"
                      : quality}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {inText != null ? inText.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {inImg != null ? inImg.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {outImg != null ? outImg.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {total != null ? total.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-accent-green">
                    {charge != null ? charge.toFixed(4) : "—"}
                  </td>
                  <td className="max-w-[120px] truncate px-3 py-2 font-mono text-muted-foreground">
                    {row.user_id ? row.user_id.slice(0, 8) + "…" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length < total && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load("append")}
          disabled={loading}
        >
          {loading ? "Загрузка…" : `Ещё (${total - items.length})`}
        </Button>
      )}
    </div>
  );
}

/**
 * Format an ISO timestamp into a deterministic "DD.MM.YYYY HH:MM:SS"
 * string (local timezone). toLocaleString hides the seconds in many
 * locales — the logs viewer needs them so we can correlate close-by
 * events.
 */
function formatTs(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
}

function levelClass(level: string): string {
  switch (level) {
    case "error":
      return "bg-red-500/20 text-red-400";
    case "warn":
      return "bg-amber-500/20 text-amber-400";
    case "info":
      return "bg-sky-500/20 text-sky-400";
    case "debug":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ---------------------------------------------------------------------
// User Histories tab — super-admin view of any user's history
//
// Pure read-only: shows cards + their masters + resize counts. Click a
// card to expand into a master+resizes detail view. No editing, no
// deleting — destructive actions stay on the user's own /history page.
// ---------------------------------------------------------------------

type AdminCardListItem = {
  id: string;
  name: string;
  preset_id: string;
  is_favorite: boolean;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  master: {
    id: string | null;
    image_url: string | null;
    width: number | null;
    height: number | null;
    upload_status: string | null;
  } | null;
  resize_count: number;
};

type AdminGenerationItem = {
  id: string;
  is_master: boolean;
  image_url: string | null;
  width: number | null;
  height: number | null;
  upload_status: string | null;
  created_at: string;
};

type AdminCardDetail = AdminCardListItem & {
  form_snapshot: Record<string, unknown>;
  master: AdminGenerationItem | null;
  resizes: AdminGenerationItem[];
};

function UserHistoriesTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pickedUserId, setPickedUserId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoadingUsers(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("limit", "100");
    apiJson<{ users: UserRow[] }>(`/api/admin/users?${params.toString()}`)
      .then((r) => {
        if (!cancelled) setUsers(r.users);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const pickedUser = useMemo(
    () => users.find((u) => u.id === pickedUserId) ?? null,
    [users, pickedUserId],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Истории пользователей</CardTitle>
        <CardDescription>
          Просмотр карточек любого пользователя. Каждый заход в эту вкладку логируется в audit_logs
          (action = admin.viewed_user_history).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            <Label className="text-xs uppercase">Пользователь</Label>
            <Input
              placeholder="Поиск по email / имени…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[400px] overflow-y-auto rounded-md border">
              {loadingUsers ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Загрузка…</p>
              ) : users.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Никого не нашлось.</p>
              ) : (
                users.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => setPickedUserId(u.id)}
                    className={
                      "block w-full px-3 py-2 text-left text-sm hover:bg-muted/40 " +
                      (pickedUserId === u.id ? "bg-muted/60 font-medium" : "")
                    }
                  >
                    <div className="truncate">{u.email}</div>
                    {(u.first_name || u.last_name || u.nickname) && (
                      <div className="truncate text-xs text-muted-foreground">
                        {[u.nickname, u.first_name, u.last_name].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
          <div>
            {pickedUser ? (
              <AdminHistoryGrid userId={pickedUser.id} userEmail={pickedUser.email} />
            ) : (
              <div className="flex h-full min-h-[200px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                Выберите пользователя слева
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminHistoryGrid({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [items, setItems] = useState<AdminCardListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [bucket, setBucket] = useState<"active" | "trash">("active");

  const load = useCallback(
    async (mode: "reset" | "append") => {
      setLoading(true);
      setErr("");
      try {
        const params = new URLSearchParams();
        params.set("user_id", userId);
        params.set("limit", "30");
        params.set("offset", String(mode === "reset" ? 0 : offset));
        if (bucket === "trash") params.set("bucket", "trash");
        const data = await apiJson<{
          items: AdminCardListItem[];
          total: number;
        }>(`/api/admin/history?${params.toString()}`);
        if (mode === "reset") {
          setItems(data.items);
          setOffset(data.items.length);
        } else {
          setItems((p) => [...p, ...data.items]);
          setOffset((p) => p + data.items.length);
        }
        setTotal(data.total);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [userId, offset, bucket],
  );

  useEffect(() => {
    setOpenCardId(null);
    void load("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, bucket]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">{userEmail}</span>
          <span className="ml-2 text-muted-foreground">— {total} карточек</span>
        </div>
        <div className="flex rounded-md border p-0.5 text-sm">
          <button
            type="button"
            className={
              "rounded px-3 py-1 " +
              (bucket === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground")
            }
            onClick={() => setBucket("active")}
          >
            Активные
          </button>
          <button
            type="button"
            className={
              "rounded px-3 py-1 " +
              (bucket === "trash" ? "bg-primary text-primary-foreground" : "text-muted-foreground")
            }
            onClick={() => setBucket("trash")}
          >
            Корзина
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((card) => (
          <button
            type="button"
            key={card.id}
            onClick={() => setOpenCardId(card.id)}
            className="overflow-hidden rounded-md border text-left hover:ring-1 hover:ring-muted-foreground/30"
          >
            <div className="relative aspect-square bg-muted">
              {card.master?.image_url ? (
                <img
                  src={card.master.image_url}
                  alt={card.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-2 text-center ds-micro text-muted-foreground">
                  Файл недоступен
                </div>
              )}
              {card.resize_count > 0 && (
                <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 ds-micro backdrop-blur">
                  +{card.resize_count}
                </span>
              )}
            </div>
            <div className="p-2">
              <p className="line-clamp-1 text-xs font-medium">{card.name}</p>
              <p className="ds-micro text-muted-foreground">
                {new Date(card.last_activity_at).toLocaleString()}
              </p>
            </div>
          </button>
        ))}
        {items.length === 0 && !loading && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            Карточек нет.
          </p>
        )}
      </div>

      {offset < total && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => load("append")}>
          {loading ? "Загрузка…" : "Загрузить ещё"}
        </Button>
      )}

      {openCardId && (
        <AdminCardDetailDialog
          userId={userId}
          cardId={openCardId}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  );
}

function AdminCardDetailDialog({
  userId,
  cardId,
  onClose,
}: {
  userId: string;
  cardId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AdminCardDetail | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiJson<{ card: AdminCardDetail }>(
      `/api/admin/history?user_id=${encodeURIComponent(userId)}&card_id=${encodeURIComponent(cardId)}`,
    )
      .then((r) => {
        if (!cancelled) setDetail(r.card);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof ApiError ? e.message : "Не удалось загрузить");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, cardId]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{detail?.name ?? "Загрузка…"}</DialogTitle>
          <DialogDescription>
            {detail
              ? `Создано ${new Date(detail.created_at).toLocaleString()} · обновлено ${new Date(detail.last_activity_at).toLocaleString()}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {err && <p className="text-sm text-destructive">{err}</p>}

        {detail && (
          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <div className="space-y-2">
              <Label className="text-xs uppercase">Мастер</Label>
              {detail.master?.image_url ? (
                <a
                  href={detail.master.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-md border"
                >
                  <img
                    src={detail.master.image_url}
                    alt="master"
                    className="h-full w-full object-cover"
                  />
                </a>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Мастер недоступен
                </div>
              )}
              {detail.master?.width && detail.master.height && (
                <p className="text-xs text-muted-foreground">
                  {detail.master.width} × {detail.master.height}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase">Ресайзы ({detail.resizes.length})</Label>
              {detail.resizes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет ресайзов.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {detail.resizes.map((r) => (
                    <a
                      key={r.id}
                      href={r.image_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="relative overflow-hidden rounded-md border"
                    >
                      {r.image_url ? (
                        <img
                          src={r.image_url}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="aspect-square w-full bg-muted" />
                      )}
                      <span className="absolute bottom-1 left-1 right-1 rounded bg-background/80 px-1 py-0.5 text-center ds-micro backdrop-blur">
                        {r.width}×{r.height}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
