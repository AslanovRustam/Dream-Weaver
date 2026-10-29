// GIF-баннер из готового баннера (src/lib/bannerGif.ts) — без браузера.
//
//   npx tsx scripts/banner-gif-check.mts
//
// Синтетический баннер (тёмный фон + «золотые» плашки текста и кнопки) прогоняем
// через все эффекты: GIF валиден, кадров сколько надо, дисплейные размеры влезают
// в лимит Google Ads (150 КБ), блик и искры не трогают тёмный фон, цикл замкнут
// (первый и последний кадр почти совпадают), повторы записаны как просили.

import { GDN_GIF_LIMIT, makeGifFromFrames, makeGifFromPixels, mergeStill, renderFrame, shineMask, sparkPoints } from "../src/lib/bannerGif";
import { GIF_NETWORK_BY_ID, checkGif, ladderFor, planGif, playsFor } from "../src/lib/gifNetworks";

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, msg: string) => (cond ? pass++ : fails.push(msg));

/** Тёмно-синий градиент с шумом, золотые плашки «заголовка» и «кнопки», белый «оффер». */
function banner(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = rnd() * 14;
      px[i] = 14 + n;
      px[i + 1] = 20 + (y / h) * 30 + n;
      px[i + 2] = 50 + (x / w) * 40 + n;
      px[i + 3] = 255;
      const gold = (x > w * 0.08 && x < w * 0.55 && y > h * 0.12 && y < h * 0.3) || (x > w * 0.6 && x < w * 0.92 && y > h * 0.7 && y < h * 0.88);
      const white = x > w * 0.08 && x < w * 0.45 && y > h * 0.4 && y < h * 0.52;
      if (gold) [px[i], px[i + 1], px[i + 2]] = [235, 180 + n, 40];
      if (white) [px[i], px[i + 1], px[i + 2]] = [245, 245, 240];
    }
  return px;
}

const isGif = (b: Uint8Array) => String.fromCharCode(...b.slice(0, 6)) === "GIF89a" && b[b.length - 1] === 0x3b;
/** Сколько кадров (Graphic Control Extension 21 F9 04) и какой счётчик повторов (NETSCAPE2.0). */
function inspect(b: Uint8Array) {
  let frames = 0;
  let loops: number | null = null;
  for (let i = 0; i < b.length - 3; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04) frames++;
  const tag = [..."NETSCAPE2.0"].map((c) => c.charCodeAt(0));
  for (let i = 0; i < b.length - 16; i++)
    if (tag.every((c, k) => b[i + k] === c)) {
      loops = b[i + 13] | (b[i + 14] << 8);
      break;
    }
  return { frames, loops };
}

const FX = { shine: true, sparkles: true, zoom: false };

// Дисплейные размеры: валидный GIF в лимите Google Ads.
for (const [w, h] of [
  [300, 250],
  [336, 280],
  [728, 90],
  [970, 90],
  [320, 50],
  [160, 600],
  [300, 600],
]) {
  const r = makeGifFromPixels(banner(w, h), w, h, { ...FX, plays: 3 });
  ok(isGif(r.bytes), `${w}×${h}: не GIF`);
  ok(!r.overLimit && r.bytes.length <= GDN_GIF_LIMIT, `${w}×${h}: ${(r.bytes.length / 1024).toFixed(0)} КБ > лимита`);
  const { frames, loops } = inspect(r.bytes);
  // Стоп-кадры склеены в один длинный: кадров в файле меньше, чем отрендерено, но не 1.
  ok(frames === r.frames && frames >= 8, `${w}×${h}: кадров ${frames}, ожидали ${r.frames}`);
  ok(loops === 2, `${w}×${h}: повторов ${loops}, для «3 раза» нужно 2`);
}

// Бесконечный цикл и один показ.
{
  const inf = inspect(makeGifFromPixels(banner(300, 250), 300, 250, { ...FX, plays: 0 }).bytes);
  ok(inf.loops === 0, `бесконечно: loops=${inf.loops}`);
  const once = inspect(makeGifFromPixels(banner(300, 250), 300, 250, { ...FX, plays: 1 }).bytes);
  ok(once.loops === null, `один показ: NETSCAPE-блока быть не должно`);
}

// Блик и искры — только по ярким местам, фон не трогают; цикл замкнут.
{
  const w = 300;
  const h = 250;
  const base = banner(w, h);
  const mask = shineMask(base, w, h);
  const bg = (Math.round(h * 0.6) * w + Math.round(w * 0.3));
  const gold = (Math.round(h * 0.2) * w + Math.round(w * 0.3));
  ok(mask[bg] < 0.02, `маска на фоне ${mask[bg].toFixed(2)}`);
  ok(mask[gold] > 0.5, `маска на золоте ${mask[gold].toFixed(2)}`);
  const sp = sparkPoints(mask, w, h, 5);
  ok(sp.length >= 2, `искр ${sp.length}`);
  ok(sp.every((p) => mask[p.y * w + p.x] > 0.35), "искра не на ярком месте");
  let changedBg = 0;
  let changedGold = 0;
  for (let k = 0; k < 30; k++) {
    const f = renderFrame(base, mask, sp, w, h, k / 30, { shine: true, sparkles: false, zoom: false });
    if (f[bg * 4] !== base[bg * 4]) changedBg++;
    if (f[gold * 4 + 2] !== base[gold * 4 + 2]) changedGold++;
  }
  ok(changedBg === 0, `блик тронул фон в ${changedBg} кадрах`);
  ok(changedGold > 0, "блик не прошёл по золоту");
  // Пауза после блика: во второй половине цикла кадр = база (без искр).
  const rest = renderFrame(base, mask, sp, w, h, 0.8, { shine: true, sparkles: false, zoom: false });
  ok(rest.every((v, i) => v === base[i]), "в паузе кадр отличается от базы");
  // Шов цикла: t≈1 и t=0 почти одинаковы (со всеми эффектами, с наездом).
  const a = renderFrame(base, mask, sp, w, h, 0, { shine: true, sparkles: true, zoom: true });
  const b = renderFrame(base, mask, sp, w, h, 0.999, { shine: true, sparkles: true, zoom: true });
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
  ok(diff <= 24, `шов цикла: разница ${diff}`);
}

// Наезд тяжелее, но GIF валиден и честно помечен.
{
  const r = makeGifFromPixels(banner(300, 250), 300, 250, { shine: true, sparkles: true, zoom: true, plays: 3 });
  ok(isGif(r.bytes), "наезд: не GIF");
  ok(r.overLimit === r.bytes.length > GDN_GIF_LIMIT, "наезд: флаг лимита не совпадает с весом");
}

// Готовые кадры (анимация баннера по слоям): fps из списка подгонки, кадров = 4 с × fps.
{
  const base = banner(728, 90);
  const mask = shineMask(base, 728, 90);
  const sp = sparkPoints(mask, 728, 90, 4);
  const asked: number[] = [];
  const r = makeGifFromFrames(
    (fps) => {
      asked.push(fps);
      const n = Math.round(4 * fps);
      return Array.from({ length: n }, (_, i) => renderFrame(base, mask, sp, 728, 90, i / n, FX));
    },
    728,
    90,
    { plays: 3 },
  );
  ok(isGif(r.bytes), "кадры: не GIF");
  ok(inspect(r.bytes).frames === r.frames && r.frames <= Math.round(4 * r.fps), `кадры: ${inspect(r.bytes).frames} при ${r.fps} кадр/с`);
  // Задержка в GIF кратна 10 мс: 15 кадр/с — это 70 мс, цикл 4 с идёт 4.2 с.
  ok(Math.abs(r.seconds - Math.round(4 * r.fps) * (Math.round(100 / r.fps) / 100)) < 0.01, `кадры: цикл ${r.seconds} с`);
  ok(asked.every((f) => f >= 10), "кадры: fps ниже 10 — движение рвётся");
  ok(new Set(asked).size === asked.length, "кадры: один fps рендерится дважды");
}

// Склейка стоп-кадров: одинаковые подряд — один длинный, шов цикла тоже.
{
  const a = new Uint8ClampedArray(16).fill(10);
  const b = new Uint8ClampedArray(16).fill(200);
  const m = mergeStill([a, a, b, b, b, a], 100);
  ok(m.frames.length === 2 && m.delays.join(",") === "300,300", `mergeStill: ${m.delays.join(",")}`);
}

// Сети: план под сеть и формат, готовый GIF проходит требования своей сети.
{
  const google = GIF_NETWORK_BY_ID.get("google")!;
  const net150 = GIF_NETWORK_BY_ID.get("net150")!;
  const free = GIF_NETWORK_BY_ID.get("free")!;
  const p = (n: typeof google, w: number, h: number, layered: boolean, slides: number) => planGif(n, { w, h, layered, slides }).mode;
  ok(p(google, 728, 90, true, 3) === "slides" && p(google, 728, 90, true, 1) === "light" && p(google, 300, 250, false, 0) === "flat", "план Google");
  ok(p(net150, 320, 50, true, 3) === "slides" && p(net150, 728, 90, true, 3) === "light", "план сети 150 КБ");
  ok(p(free, 728, 90, true, 3) === "scene" && p(free, 468, 60, true, 3) === "slides" && p(free, 468, 60, true, 1) === "scene", "план свободный вес");
  ok(ladderFor(google, "scene").every((s) => 1000 / s.fps > google.minFrameMs), "Google: все ступени медленнее 5 кадр/с");
  ok(playsFor(google, 7.2, 0) === 4 && playsFor(google, 4, 0) === 7 && playsFor(google, 40, 0) === 1, "Google: повторы в 30 с");
  ok(playsFor(free, 4, 0) === 0 && playsFor(net150, 4, 3) === 3, "повторы без ограничения — как выбрал пользователь");
  // Блик поверх под Google: шаги 4 кадр/с, ≤150 КБ, ≤30 с.
  for (const [w, h] of [[300, 250], [728, 90], [160, 600]]) {
    const plays = playsFor(google, 2.4, 0);
    const r = makeGifFromPixels(banner(w, h), w, h, { ...FX, seconds: 2.4, plays, maxBytes: google.maxBytes, ladder: ladderFor(google, "flat") });
    const c = checkGif(google, { bytes: r.bytes.length, seconds: r.seconds, plays, minFrameMs: r.minFrameMs });
    ok(c.every((x) => x.ok), `Google ${w}×${h}: ${c.filter((x) => !x.ok).map((x) => x.label).join("; ")}`);
    ok(inspect(r.bytes).loops === plays - 1, `Google ${w}×${h}: повторов в файле ${inspect(r.bytes).loops}`);
  }
  // Бесконечные повторы под Google не проходят.
  ok(!checkGif(google, { bytes: 1000, seconds: 3, plays: 0, minFrameMs: 250 }).every((x) => x.ok), "Google: бесконечный цикл не проходит");
  ok(!checkGif(google, { bytes: 1000, seconds: 3, plays: 2, minFrameMs: 100 }).every((x) => x.ok), "Google: 10 кадр/с не проходит");
}

if (fails.length) {
  console.log(fails.map((f) => "✗ " + f).join("\n"));
  console.log(`\n${fails.length} проблем, ${pass} проверок прошли`);
  process.exit(1);
}
console.log(`✓ все ${pass} проверок прошли`);
