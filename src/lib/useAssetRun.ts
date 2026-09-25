"use client";

import { useCallback, useRef, useState } from "react";

import { fetchBalance } from "@/components/AppHeader";

/**
 * Пакетная сборка ассетов лендинга.
 *
 * Раньше фон, персонажей и иконки жали по одной кнопке каждый и ждали
 * результата по очереди. Здесь тот же набор запускается разом, а человек
 * видит список: что готово, что идёт, что не вышло.
 *
 * Правила, которые стоит держать в голове при добавлении шагов:
 *
 * • Параллельность ограничена: роуты пускают от одного пользователя считанные
 *   генерации в лёте, и пачка из пяти запросов упрётся в 429 вместо картинок.
 * • Упавший шаг не отменяет остальные. Каждая генерация платная, и терять
 *   четыре удавшихся из-за одной неудачной нельзя.
 * • Баланс проверяем до старта: узнать о нехватке кредитов на третьем шаге —
 *   это уже оплаченная половина работы и незаконченный лендинг.
 */
export type AssetStep = {
  id: string;
  label: string;
  /** Во сколько кредитов обойдётся шаг — для сметы до старта. */
  credits: number;
  /** true — шаг выполняется первым и в одиночку (обычно фон). */
  blocking?: boolean;
  /** Успех/неуспех. Бросать не нужно: исключение тоже считаем неуспехом. */
  run: () => Promise<boolean>;
};

export type AssetStepState = {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "error";
};

/** Сколько генераций держим в лёте одновременно. */
const PARALLEL = 2;

export function useAssetRun() {
  const [steps, setSteps] = useState<AssetStepState[]>([]);
  const [running, setRunning] = useState(false);
  const [notEnough, setNotEnough] = useState("");
  const cancelRef = useRef(false);

  const patch = (id: string, status: AssetStepState["status"]) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setSteps((prev) =>
      prev.map((s) => (s.status === "queued" ? { ...s, status: "error" } : s)),
    );
  }, []);

  const start = useCallback(async (list: AssetStep[]) => {
    if (list.length === 0) return;
    cancelRef.current = false;
    setNotEnough("");

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
      // Блокирующие шаги идут первыми и по одному: обычно это фон, от которого
      // отталкивается остальное.
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
  }, []);

  const clear = useCallback(() => {
    setSteps([]);
    setNotEnough("");
  }, []);

  return { steps, running, notEnough, start, cancel, clear };
}
