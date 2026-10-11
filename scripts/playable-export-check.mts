// Проверка выгрузки плейблов: каждая механика × каждая сеть + превью.
//
//   npx tsx scripts/playable-export-check.mts
//
// Что ловит: мёртвую кнопку (нет выхода по клику), не ту упаковку под сеть,
// лишние внешние запросы в MRAID, javascript:-ссылку в файле, побег из
// <script> через текст оффера, перевес по лимиту и — главное — синтаксическую
// ошибку во встроенном рантайме: он собран из строк, и одно неверное
// экранирование ломает игру целиком, не давая ни одной ошибки при сборке.

import {
  PLAYABLE_MECHANICS,
  PLAYABLE_NETWORKS,
  buildPlayableHtml,
  googleAdSize,
  type PlayableInput,
  type PlayableNetwork,
} from "../src/lib/playableGen";
import { PLAYABLE_TEMPLATES } from "../src/lib/playableTemplates";

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};

// Фон ≈ 250 КБ и шесть символов ≈ 20 КБ — то, что даёт ИИ-оформление после ужатия.
const fakeImage = (bytes: number, mime: string) =>
  `data:${mime};base64,` + Buffer.alloc(bytes, 7).toString("base64");
const BG = fakeImage(250 * 1024, "image/jpeg");
const SYMBOLS = Array.from({ length: 6 }, () => fakeImage(20 * 1024, "image/png"));
const CLICK = "https://store.example/app?utm=1";

const base = (over: Partial<PlayableInput>): PlayableInput => ({
  mechanic: "slot",
  offer: "Бонус 100% </script><script>alert(1)</script>",
  brandName: "Brand",
  brandLogo: "",
  language: "ru",
  accent: "#d4ff3d",
  alwaysWin: true,
  ctaText: "Забрать",
  duration: "short",
  ratio: "9:16",
  reels: 3,
  slotSymbols: SYMBOLS,
  wheelPrizes: ["A", "B", "C"],
  scratchPrize: "100 FS",
  quizQuestion: "Кто?",
  quizAnswers: ["Да", "Нет"],
  quizCorrect: 0,
  match3Moves: 8,
  clickUrl: CLICK,
  network: "mraid",
  bgImage: BG,
  ...over,
});

/** Встроенный рантайм должен быть валидным JS — иначе игра просто не запустится. */
function runtimeCompiles(html: string): string | null {
  const m = /<script>\(([\s\S]*)\);<\/script><\/body>/.exec(html);
  if (!m) return "рантайм не найден";
  try {
    // eslint-disable-next-line no-new-func
    new Function("return (" + m[1] + ");");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const count = (h: string, needle: string) => h.split(needle).length - 1;

for (const mech of PLAYABLE_MECHANICS) {
  for (const target of [...PLAYABLE_NETWORKS.map((n) => n.id), "preview"] as (PlayableNetwork | "preview")[]) {
    const preview = target === "preview";
    const network: PlayableNetwork = preview ? "mraid" : target;
    for (const ratio of ["9:16", "16:9", "1:1"]) {
      const tag = `${mech.id} / ${target} / ${ratio}`;
      const html = buildPlayableHtml(base({ mechanic: mech.id, network, ratio, preview }));

      const err = runtimeCompiles(html);
      check(`${tag}: рантайм компилируется`, err === null, err ?? "");
      check(`${tag}: кнопка уводит по клику`, html.includes("addEventListener('click', exitAd)"));
      check(`${tag}: оффер не вырывается из <script>`, !html.includes("<script>alert(1)"));
      check(`${tag}: ровно столько </script>, сколько тегов`, count(html, "</script>") === (preview ? 1 : 2));

      const external = [...html.matchAll(/https?:\/\/[^"'\\\s)]+/g)].map((x) => x[0]).filter((u) => !u.startsWith(CLICK));
      if (preview) {
        check(`${tag}: в превью нет подключений сети`, !html.includes("mraid.js") && !html.includes("exitapi.js"));
      } else if (network === "mraid") {
        check(`${tag}: mraid.js подключён`, html.includes('<script src="mraid.js"></script>'));
        check(`${tag}: старт по ready`, html.includes("mraid.addEventListener('ready', start)"));
        check(`${tag}: других внешних запросов нет`, external.length === 0, external.join(", "));
      } else {
        const { w, h } = googleAdSize(ratio);
        check(`${tag}: ad.size ${w}x${h}`, html.includes(`content="width=${w},height=${h}"`));
        check(`${tag}: exitapi.js подключён`, html.includes("/html5/api/exitapi.js"));
      }

      const limit = PLAYABLE_NETWORKS.find((n) => n.id === network)!.limit;
      check(`${tag}: вес под лимитом`, Buffer.byteLength(html) < limit, `${Buffer.byteLength(html)} байт`);
    }
  }
}

// Опасная ссылка в файл не попадает.
{
  const html = buildPlayableHtml(base({ clickUrl: "javascript:alert(document.cookie)" }));
  check("javascript:-ссылка вычищена", !html.includes("javascript:alert"));
}

// Шаблоны: механика существует, значения в рамках формы.
for (const t of PLAYABLE_TEMPLATES) {
  check(`шаблон ${t.id}: механика`, PLAYABLE_MECHANICS.some((m) => m.id === t.mechanic));
  check(`шаблон ${t.id}: цвет`, /^#[0-9a-fA-F]{6}$/.test(t.accent));
  if (t.reels !== undefined) check(`шаблон ${t.id}: барабаны`, [3, 4, 5].includes(t.reels));
  if (t.match3Moves !== undefined) check(`шаблон ${t.id}: ходы`, [5, 8, 12].includes(t.match3Moves));
  if (t.wheelPrizes) check(`шаблон ${t.id}: секторов ≥ 2`, t.wheelPrizes.length >= 2);
  if (t.quizAnswers) {
    check(`шаблон ${t.id}: ответов ≥ 2`, t.quizAnswers.length >= 2);
    check(`шаблон ${t.id}: верный ответ в списке`, (t.quizCorrect ?? 0) < t.quizAnswers.length);
  }
  const html = buildPlayableHtml(base({ mechanic: t.mechanic, wheelPrizes: t.wheelPrizes ?? ["A", "B"] }));
  check(`шаблон ${t.id}: собирается`, runtimeCompiles(html) === null);
}

const total = PLAYABLE_MECHANICS.length * 3 * 3;
console.log(failed ? `\nНе прошло проверок: ${failed}` : `\nВсе проверки прошли (${total} сборок + шаблоны)`);
process.exit(failed ? 1 : 0);
