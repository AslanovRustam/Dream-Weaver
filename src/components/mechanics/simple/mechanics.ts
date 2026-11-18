// Своё у каждой механики в простом режиме: примеры ТЗ и решения, которые нужны
// и форме (apply), и плану с ценой (строки до запуска) — считаются из плана одинаково.
import type { TzExample } from "@/components/simple/TzInputBox";
import type { MatchSport, PrizeType } from "@/lib/matchLogic";
import { matchPrize, matchSport } from "./match";
import { offerParts, type MechanicPlan } from "./plan";

export const MECHANIC_EXAMPLES: Record<"wheel" | "slot" | "crash" | "match", TzExample[]> = {
  wheel: [
    {
      label: "Колесо: бонус на депозит",
      text: "Колесо фортуны для казино, Казахстан. Главный приз: 150% на первый депозит + 100 фриспинов. Русский язык, кнопка «Крутить». Стиль — степь на закате, золото и бирюза, весёлый маскот-барс. 18+.",
    },
    {
      label: "Колесо на Хэллоуин",
      text: "Halloween wheel for an online casino, English. Prize: 200 free spins on «Book of Dead». Pumpkins, fog, purple and orange neon, a friendly witch mascot. Button «Spin now». 18+, T&C apply.",
    },
    {
      label: "Колесо к 8 Марта",
      text: "Колесо фортуны к 8 Марта для казино. Оффер: 100% до 50 000 ₽ + 50 FS. Премиальный стиль: чёрный и золото, тюльпаны, мягкий свет, две девушки-маскота по бокам колеса. Русский язык. 18+.",
    },
  ],
  slot: [
    {
      label: "Слот: фриспины новичкам",
      text: "Лендинг-слот для новых игроков: 100 фриспинов + 100% на первый депозит до 30 000 ₽. Русский язык. Египет: пирамиды, скарабеи, золото, Клеопатра-маскот. Кнопка «Крутить». 18+.",
    },
    {
      label: "Новогодний слот",
      text: "Новогодний слот-лендинг: 50 фриспинов в «Sweet Bonanza Xmas». Снег, конфеты, гирлянды, Дед Мороз. Украинский язык, кнопка «Грати». 18+.",
    },
    {
      label: "Slot for Brazil",
      text: "Slot landing for Brazil, Portuguese. 200% bônus até R$ 1.000 + 50 rodadas grátis. Carnival theme: feathers, samba, bright green and yellow. Button «Jogar agora». 18+.",
    },
  ],
  crash: [
    {
      label: "Crash: ракета и кэшаут",
      text: "Crash-лендинг: ракета взлетает, множитель растёт — успей забрать. Бонус 100% на первый депозит до 20 000 ₽. Космос, неон, фиолетово-голубая гамма, пилот-маскот. Русский. 18+.",
    },
    {
      label: "Crash в стиле самолёта",
      text: "Crash game landing in Spanish for Mexico: a red jet plane flies, multiplier grows. Bono 150% hasta $5,000 MXN. Sunset sky, clouds, gold coins. Button «Jugar». 18+.",
    },
    {
      label: "Crash для Узбекистана",
      text: "Crash-лендинг для Узбекистана, тексты на узбекском. Оффер: 100% birinchi depozitga 5 000 000 so'm gacha. Ночь, Самарканд, золото. Кнопка «O'ynash».",
    },
  ],
  match: [
    {
      label: "Финал Лиги чемпионов",
      text: "Матч-прогноз на финал Лиги чемпионов: Реал — Боруссия, 1 июня, 22:00. Фрибет 500 ₽ за первую ставку на матч. Русский язык, ночной стадион, золото кубка. 18+.",
    },
    {
      label: "Дерби в хоккее",
      text: "Лендинг на хоккейное дерби СКА — ЦСКА, суббота 19:30. Кэшбек 10% на ставки на матч. Лёд, прожекторы, сине-красные цвета. Кнопка «Сделать ставку».",
    },
    {
      label: "UFC fight night",
      text: "Match prediction landing for a UFC main event in English: two fighters, Saturday 03:00. Free bet $20 on your first bet. Octagon, dramatic lights, red and gold. Button «Bet now». 18+.",
    },
  ],
};

/** Слот: выигрыши по попыткам — части оффера дословно; без оффера — бонус от копирайтера. */
export function slotAttempts(p: MechanicPlan): string[] {
  const parts = offerParts(p.offer);
  return parts.length ? parts : [p.scene.win || ""];
}

/** Матч: команды, событие, вид спорта, приз — из плана. */
export function matchDecisions(p: MechanicPlan, cur: { sport: MatchSport }) {
  const home = (p.scene.home ?? "").trim();
  const away = (p.scene.away ?? "").trim();
  const prize: { type: PrizeType; amount: string; currency: string } | null = matchPrize(p.offer);
  return {
    teams: home && away ? { home, away } : null,
    event: (p.scene.event ?? "").trim(),
    sport: matchSport(`${p.scene.sport ?? ""} ${p.u.job.summary} ${home} ${away}`, cur.sport),
    prize,
    terms: (p.scene.terms ?? "").trim(),
  };
}
