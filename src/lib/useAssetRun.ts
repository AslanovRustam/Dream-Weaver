"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBalance } from "@/components/AppHeader";
import { apiFetch } from "@/lib/api-client";

/**
 * Пакетная сборка ассетов лендинга.
 *
 * Сборка ставится в серверную очередь (/api/jobs): исполняет её сервер, а
 * вкладка только следит за прогрессом и забирает готовое. Закрыли вкладку —
 * шаги идут дальше; вернулись — подхватываем сборку по ключу и раскладываем
 * то, что успело сделаться.
 *
 * Если очереди на сервере ещё нет (не применена миграция 0015), сборка идёт
 * по-старому, во вкладке: шаги вызываются отсюда же. Правила у обоих путей
 * одни — фон первым, дальше по двое, упавший шаг не отменяет остальные,
 * баланс проверяется до старта.
 */
export type AssetStep = {
  id: string;
  label: string;
  /** Во сколько кредитов обойдётся шаг — для сметы до старта. */
  credits: number;
  /** true — шаг выполняется первым и в одиночку (обычно фон). */
  blocking?: boolean;
  /** Сборка во вкладке: вызвать генерацию отсюда. */
  run: () => Promise<boolean>;
  /** Сборка на сервере: какой роут позвать и с чем. */
  server?: { route: string; body: Record<string, unknown> };
};

export type AssetStepState = {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "error";
};

/**
 * Разложить готовую картинку шага по местам. Получает data URL — к нему уже
 * можно применять канвас (обрезку персонажа, нарезку иконок).
 */
export type ApplyAsset = (stepId: string, dataUrl: string) => Promise<void>;

/** Сколько генераций держим в лёте во вкладке. */
const PARALLEL = 2;
const POLL_MS = 2_500;

type ServerJob = {
  id: string;
  key: string;
  label: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  result: { url?: string } | null;
  error: string | null;
};

type Stored = { batchId: string; applied: string[] };

function readStored(key: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, v: Stored | null) {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch {
    /* приватный режим — подхватить после перезагрузки не выйдет, сборка всё равно идёт */
  }
}

/** FTP не отдаёт CORS — для канваса картинку берём через свой сервер. */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await apiFetch("/api/fetch-master", { method: "POST", json: { url } });
  const data = (await res.json()) as { dataUrl?: string };
  if (!res.ok || !data.dataUrl) throw new Error("Не удалось забрать картинку");
  return data.dataUrl;
}

const toStepStatus = (s: ServerJob["status"]): AssetStepState["status"] =>
  s === "cancelled" ? "error" : s;

export function useAssetRun(opts: { resumeKey: string; apply: ApplyAsset }) {
  const [steps, setSteps] = useState<AssetStepState[]>([]);
  const [running, setRunning] = useState(false);
  const [notEnough, setNotEnough] = useState("");
  const cancelRef = useRef(false);
  const batchRef = useRef<string | null>(null);
  // apply пересоздаётся на каждый рендер страницы — держим свежую версию.
  const applyRef = useRef(opts.apply);
  applyRef.current = opts.apply;

  const patch = (id: string, status: AssetStepState["status"]) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));

  /** Следить за серверной сборкой, пока в ней есть незаконченные шаги. */
  const follow = useCallback(
    async (batchId: string) => {
      // Второй следящий за той же сборкой разложил бы одни и те же картинки
      // дважды. В разработке React запускает эффекты дважды — это ровно тот случай.
      if (batchRef.current === batchId) return;
      batchRef.current = batchId;
      setRunning(true);
      const stored = readStored(opts.resumeKey) ?? { batchId, applied: [] };
      const applied = new Set(stored.applied);
      try {
        for (;;) {
          const res = await apiFetch(`/api/jobs?batch=${batchId}`).catch(() => null);
          // Сборки нет, человек вышел из аккаунта или очередь на сервере
          // выключена — следить не за чем. Повторять имеет смысл только сбои
          // сети и пятисотые.
          if (res && [401, 403, 404, 503].includes(res.status)) {
            writeStored(opts.resumeKey, null);
            setSteps([]);
            return;
          }
          if (!res || !res.ok) {
            await new Promise((r) => setTimeout(r, POLL_MS * 2));
            continue;
          }
          const { jobs } = (await res.json()) as { jobs: ServerJob[] };
          setSteps(jobs.map((j) => ({ id: j.key, label: j.label, status: toStepStatus(j.status) })));

          for (const j of jobs) {
            if (j.status !== "done" || applied.has(j.id) || !j.result?.url) continue;
            try {
              await applyRef.current(j.key, await toDataUrl(j.result.url));
            } catch {
              /* картинка готова и лежит на сервере — не смогли разложить, но это не повод ронять сборку */
            }
            applied.add(j.id);
            writeStored(opts.resumeKey, { batchId, applied: [...applied] });
          }

          const open = jobs.some((j) => j.status === "queued" || j.status === "running");
          if (!open) {
            writeStored(opts.resumeKey, null);
            return;
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } finally {
        batchRef.current = null;
        setRunning(false);
      }
    },
    [opts.resumeKey],
  );

  // Вернулись на страницу посреди сборки — подхватываем её.
  useEffect(() => {
    const stored = readStored(opts.resumeKey);
    if (stored?.batchId) void follow(stored.batchId);
  }, [opts.resumeKey, follow]);

  /** Прежний путь: шаги вызываются из вкладки. */
  const runInTab = async (list: AssetStep[]) => {
    const total = list.reduce((sum, s) => sum + s.credits, 0);
    const balance = await fetchBalance();
    if (balance !== null && balance < total) {
      setNotEnough(`Нужно ${total} кредитов, на балансе ${balance}.`);
      return;
    }
    setSteps(list.map((s) => ({ id: s.id, label: s.label, status: "queued" as const })));
    setRunning(true);
    const exec = async (step: AssetStep) => {
      if (cancelRef.current) return;
      patch(step.id, "running");
      try {
        patch(step.id, (await step.run()) ? "done" : "error");
      } catch {
        patch(step.id, "error");
      }
    };
    try {
      for (const step of list.filter((s) => s.blocking)) await exec(step);
      const queue = list.filter((s) => !s.blocking);
      await Promise.all(
        Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
          for (;;) {
            const next = queue.shift();
            if (!next || cancelRef.current) return;
            await exec(next);
          }
        }),
      );
    } finally {
      setRunning(false);
    }
  };

  const start = useCallback(
    async (list: AssetStep[]) => {
      if (list.length === 0 || batchRef.current) return;
      cancelRef.current = false;
      setNotEnough("");

      if (list.every((s) => s.server)) {
        const res = await apiFetch("/api/jobs", {
          method: "POST",
          json: {
            steps: list.map((s) => ({
              key: s.id,
              label: s.label,
              blocking: !!s.blocking,
              route: s.server!.route,
              body: s.server!.body,
            })),
          },
        });
        // 503 — очереди на сервере ещё нет, собираем во вкладке.
        if (res.status !== 503) {
          const data = (await res.json().catch(() => ({}))) as {
            batchId?: string;
            jobs?: ServerJob[];
            error?: string;
          };
          if (!res.ok || !data.batchId) {
            setNotEnough(data.error || "Не удалось запустить сборку");
            return;
          }
          writeStored(opts.resumeKey, { batchId: data.batchId, applied: [] });
          setSteps(
            (data.jobs ?? []).map((j) => ({ id: j.key, label: j.label, status: toStepStatus(j.status) })),
          );
          await follow(data.batchId);
          return;
        }
      }
      await runInTab(list);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [follow, opts.resumeKey],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
    const batchId = batchRef.current;
    if (batchId) {
      // Отменяются только шаги в очереди: начатые уже оплачены и доводятся до конца.
      void apiFetch("/api/jobs/cancel", { method: "POST", json: { batchId } });
    }
    setSteps((prev) => prev.map((s) => (s.status === "queued" ? { ...s, status: "error" } : s)));
  }, []);

  const clear = useCallback(() => {
    setSteps([]);
    setNotEnough("");
  }, []);

  return { steps, running, notEnough, start, cancel, clear };
}
