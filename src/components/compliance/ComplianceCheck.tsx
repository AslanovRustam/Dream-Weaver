"use client";

// «Проверка перед модерацией»: выбираешь сети и страну показа — модель смотрит
// на креатив и отвечает по правилам (lib/compliance/rules). Бесплатно.
// Что по картинке не проверить (лицензия, сертификат, таргет) — списком
// «проверьте сами». Выбор сетей и страны запоминается в браузере.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Info, Loader2, ShieldCheck, X } from "lucide-react";

import { apiJson } from "@/lib/api-client";
import {
  COMPLIANCE_GEOS,
  COMPLIANCE_NETWORKS,
  complianceRules,
  complianceVerdict,
  geoFromText,
  isGeoId,
  isNetworkId,
  type ComplianceGeoId,
  type ComplianceNetworkId,
  type ComplianceResult,
} from "@/lib/compliance/rules";

const PREFS_KEY = "dw:compliance";

function loadPrefs(): { networks: ComplianceNetworkId[]; geo: ComplianceGeoId | null } {
  try {
    const j = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as { networks?: unknown[]; geo?: unknown };
    return { networks: (j.networks ?? []).filter(isNetworkId), geo: isGeoId(j.geo) ? j.geo : null };
  } catch {
    return { networks: [], geo: null };
  }
}

function savePrefs(networks: ComplianceNetworkId[], geo: ComplianceGeoId) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ networks, geo }));
  } catch {
    /* приватное окно — не страшно */
  }
}

const VERDICT = {
  pass: { icon: ShieldCheck, cls: "border-accent-green/40 bg-accent-green/5", iconCls: "text-accent-green", title: "Похоже, пройдёт модерацию" },
  risk: { icon: AlertTriangle, cls: "border-amber-500/40 bg-amber-500/5", iconCls: "text-amber-400", title: "Есть риски — лучше поправить" },
  reject: { icon: X, cls: "border-destructive/40 bg-destructive/5", iconCls: "text-destructive", title: "Скорее всего, отклонят" },
} as const;

export function ComplianceCheck({
  image,
  geoHint,
  defaultOpen = false,
}: {
  /** Креатив: data URL или публичная ссылка. */
  image: string | null | undefined;
  /** GEO из ТЗ свободным текстом («Германия», «UK») — подставим страну. */
  geoHint?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [networks, setNetworks] = useState<ComplianceNetworkId[]>([]);
  const [geo, setGeo] = useState<ComplianceGeoId>("any");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ComplianceResult[] | null>(null);
  const [checked, setChecked] = useState<{ networks: ComplianceNetworkId[]; geo: ComplianceGeoId } | null>(null);

  // Страна из ТЗ важнее запомненной: креатив делали под неё.
  useEffect(() => {
    const p = loadPrefs();
    setNetworks(p.networks);
    const fromTz = geoFromText(geoHint);
    setGeo(fromTz !== "any" ? fromTz : (p.geo ?? "any"));
  }, [geoHint]);

  // Другой креатив — старый итог к нему не относится.
  useEffect(() => {
    setResults(null);
    setChecked(null);
    setError(null);
  }, [image]);

  const rules = useMemo(() => (checked ? complianceRules(checked.networks, checked.geo) : []), [checked]);
  const visual = rules.filter((r) => r.check === "visual");
  const info = rules.filter((r) => r.check === "info");
  const verdict = results ? complianceVerdict(rules, results) : null;
  const byId = new Map((results ?? []).map((r) => [r.id, r]));
  // Сначала то, из-за чего отклонят, потом предупреждения.
  const failed = visual
    .filter((r) => byId.get(r.id) && !byId.get(r.id)!.ok)
    .sort((a, b) => Number(a.severity !== "block") - Number(b.severity !== "block"));
  const passed = visual.filter((r) => byId.get(r.id)?.ok);
  const stale = !!checked && (checked.geo !== geo || checked.networks.join() !== networks.join());

  const toggle = (id: ComplianceNetworkId) =>
    setNetworks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function run() {
    if (!image) return;
    setBusy(true);
    setError(null);
    savePrefs(networks, geo);
    try {
      const r = await apiJson<{ results: ComplianceResult[] }>("/api/compliance/check", {
        method: "POST",
        body: JSON.stringify({ image, networks, geo }),
      });
      setResults(r.results);
      setChecked({ networks: [...networks], geo });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверка недоступна");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-background/40 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <ShieldCheck className="h-4 w-4 text-accent-green" />
        <span className="font-medium">Проверка перед модерацией</span>
        {verdict && !open ? <span className="text-xs text-muted-foreground">· {VERDICT[verdict].title}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">бесплатно</span>
        <ChevronDown className={"h-4 w-4 text-muted-foreground transition " + (open ? "rotate-180" : "")} />
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-3">
          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">Где крутите</div>
            <div className="flex flex-wrap gap-1.5">
              {COMPLIANCE_NETWORKS.map((n) => {
                const on = networks.includes(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    title={n.hint}
                    aria-pressed={on}
                    onClick={() => toggle(n.id)}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs transition " +
                      (on ? "border-accent-green bg-accent-green/15 text-foreground" : "border-border text-muted-foreground hover:border-foreground/40")
                    }
                  >
                    {n.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Страна показа</span>
            <select
              value={geo}
              onChange={(e) => setGeo(e.target.value as ComplianceGeoId)}
              className="w-full max-w-xs rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              {COMPLIANCE_GEOS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!image || busy}
              onClick={run}
              className="flex items-center gap-1.5 rounded-lg bg-accent-green px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {busy ? "Проверяю…" : results ? "Проверить ещё раз" : "Проверить"}
            </button>
            {stale && !busy ? <span className="text-xs text-amber-400">Выбор изменился — проверьте ещё раз</span> : null}
            {!image ? <span className="text-xs text-muted-foreground">Нет картинки для проверки</span> : null}
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {verdict ? (
            <div className={"flex flex-col gap-2 rounded-lg border p-3 " + VERDICT[verdict].cls}>
              <div className="flex items-center gap-1.5 font-medium">
                {(() => {
                  const Icon = VERDICT[verdict].icon;
                  return <Icon className={"h-4 w-4 " + VERDICT[verdict].iconCls} />;
                })()}
                {VERDICT[verdict].title}
              </div>
              {failed.length ? (
                <ul className="flex flex-col gap-1.5 text-xs">
                  {failed.map((r) => (
                    <li key={r.id} className="flex items-start gap-1.5">
                      <span className={r.severity === "block" ? "text-destructive" : "text-amber-400"}>
                        {r.severity === "block" ? "✗" : "!"}
                      </span>
                      <span>
                        {r.text}
                        {byId.get(r.id)?.note ? <span className="text-muted-foreground"> — {byId.get(r.id)!.note}</span> : null}
                        {r.fix ? <span className="mt-0.5 block text-foreground/80">Как исправить: {r.fix}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {passed.length ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">Выполнено: {passed.length}</summary>
                  <ul className="mt-1 flex flex-col gap-1">
                    {passed.map((r) => (
                      <li key={r.id} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent-green" /> {r.text}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          {info.length && verdict ? (
            <div className="rounded-lg border border-border p-3 text-xs">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <Info className="h-3.5 w-3.5 text-muted-foreground" /> По картинке не проверить — проверьте сами
              </div>
              <ul className="list-disc pl-5 text-muted-foreground">
                {info.map((r) => (
                  <li key={r.id}>{r.text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[11px] leading-snug text-muted-foreground">
            Это предпроверка по частым требованиям сетей и регуляторов, не юридическая консультация. Правила меняются —
            перед запуском сверьтесь с правилами сети и лицензией оффера.
          </p>
        </div>
      ) : null}
    </section>
  );
}
