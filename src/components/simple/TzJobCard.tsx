"use client";

// Карточка «Как я понял ТЗ» — общая для всех инструментов: суть задачи, оффер,
// язык и гео, бренд, референсы с ролями, ссылки (открылись или нет), требования
// с отметкой проверки, допущения и что не сделать как написано. Решения самого
// инструмента (шаблон, механика, блоки…) — в children.
import type { ReactNode } from "react";
import { Check, ImagePlus, Link2, XCircle } from "lucide-react";

import type { TzCheck, TzUnderstood } from "@/lib/tz/client";

const ROLE_LABEL: Record<string, string> = {
  style: "стиль",
  main: "главный визуал",
  brand: "бренд",
  character: "персонаж",
  layout: "композиция",
  irrelevant: "не используем",
};

/** Строка «подпись — значение» для решений инструмента. */
export function JobRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export function TzJobCard({
  u,
  check,
  rows,
  children,
}: {
  u: TzUnderstood;
  check?: TzCheck | null;
  /** Решения инструмента в виде строк JobRow — встают в общий список. */
  rows?: ReactNode;
  children?: ReactNode;
}) {
  const { job } = u;
  const checkOf = (id: string) => check?.results.find((r) => r.id === id);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-accent-green/30 bg-accent-green/5 p-4 text-sm">
      <h3 className="ds-h4">Как я понял ТЗ</h3>
      <p>{job.summary}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {job.offer ? <JobRow label="Оффер">{job.offer}</JobRow> : null}
        <JobRow label="Язык / гео">
          {job.language}
          {job.geo ? ` · ${job.geo}` : ""}
        </JobRow>
        {job.brand.name ? <JobRow label="Бренд">{job.brand.name}</JobRow> : null}
        {rows}
      </dl>

      {children}

      {u.images.length ? (
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">Референсы</div>
          <div className="flex flex-wrap gap-2">
            {u.images.map((im) => {
              const r = job.images.find((x) => x.id === im.id);
              return (
                <div key={im.id} className="w-20" title={r?.note || im.from}>
                  <img src={im.src} alt="" className="h-14 w-20 rounded-md object-cover" />
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{ROLE_LABEL[r?.role ?? "style"]}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {u.links.length ? (
        <div className="flex flex-col gap-1 text-xs">
          {u.links.map((l) => (
            <div key={l.url} className="flex items-start gap-1.5">
              <Link2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${l.ok ? "text-accent-green" : "text-destructive"}`} />
              <span className="min-w-0 break-all">
                {l.url}
                <span className="text-muted-foreground">
                  {" — "}
                  {l.ok ? job.links.find((x) => x.url === l.url)?.note || l.name : `не открылась: ${l.error}`}
                  {l.ok && l.error ? ` (${l.error})` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {job.requirements.length ? (
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">Требования ТЗ{check ? " — проверка готового результата" : ""}</div>
          <ul className="flex flex-col gap-1 text-xs">
            {job.requirements.map((r) => {
              const c = checkOf(r.id);
              return (
                <li key={r.id} className="flex items-start gap-1.5">
                  {c ? (
                    c.ok ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-green" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    )
                  ) : (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                  )}
                  <span>
                    {r.text}
                    {c && !c.ok && c.note ? <span className="text-destructive"> — {c.note}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {check?.faceCovered ? <p className="mt-1 text-xs text-destructive">Надпись или кнопка закрывает лицо персонажа.</p> : null}
        </div>
      ) : null}

      {job.assumptions.length ? (
        <div className="text-xs">
          <div className="mb-1 text-muted-foreground">Чего не было в ТЗ — решил сам</div>
          <ul className="list-disc pl-4">
            {job.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {job.cannot.length ? (
        <div className="text-xs">
          <div className="mb-1 text-muted-foreground">Что не сделать как написано</div>
          <ul className="list-disc pl-4">
            {job.cannot.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {u.sources.some((s) => !s.ok || s.note) ? (
        <div className="text-xs text-muted-foreground">
          {u.sources
            .filter((s) => !s.ok || s.note)
            .map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <ImagePlus className="h-3 w-3" /> {s.name}: {s.note ?? "не прочитано"}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
