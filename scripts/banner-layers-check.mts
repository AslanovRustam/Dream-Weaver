// Тонкие форматы баннеров: раскладка слоями (src/lib/bannerLayers.ts).
//
//   npx tsx scripts/banner-layers-check.mts
//
// Для всех размеров каталога, которые собираются слоями, и для коротких/длинных
// текстов проверяем раскладку без браузера (ширина строки — оценка по числу знаков):
// всё внутри баннера, кнопка есть и не наезжает на текст, текст не мельче 7 px,
// оффер виден. Сама отрисовка на canvas — в браузере, тут не нужна.

import { BANNER_SIZE_GROUPS } from "../src/lib/bannerSizes";
import { bandsFromAlpha, sameWord, sheetTokens } from "../src/lib/textArt";
import { wrapUnits, compactOffer, gifKind, layerKind, layoutBanner, bannerSlides, type Box, type Measure, type Op } from "../src/lib/bannerLayers";

// Оценка ширины: Unbounded 900 широкий (~0.78 em на знак в верхнем регистре), Manrope 800 — ~0.6 em.
const measure: Measure = (t, f) => {
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(f)![1]);
  const k = f.includes("Unbounded") ? 0.78 : 0.6;
  return [...t].length * size * k;
};

const TEXTS = [
  { headline: "Крути колесо", offer: "+200% и 500 FS", cta: "Играть" },
  { headline: "Крути колесо удачи и забирай приветственный бонус", offer: "+200% до 50 000 ₽ и 500 фриспинов", cta: "Забрать бонус" },
  { headline: "", offer: "Фрибет 500 ₽", cta: "Сделать ставку" },
];

const sizes = BANNER_SIZE_GROUPS.flatMap((g) => g.sizes).filter((s) => layerKind(s.w, s.h));
const must = ["728x90", "970x90", "468x60", "320x50", "160x600", "120x600", "300x1050"];
let pass = 0;
const fails: string[] = [];
const ok = (c: boolean, m: string) => (c ? pass++ : fails.push(m));

for (const k of must) ok(sizes.some((s) => `${s.w}x${s.h}` === k), `${k} нет в каталоге слоёв`);

const inside = (b: Box, w: number, h: number) => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5;
const textBox = (op: Extract<Op, { kind: "text" }>): Box => {
  const tw = Math.min(measure(op.text, op.font), op.maxW);
  const x = op.align === "center" ? op.x - tw / 2 : op.align === "right" ? op.x - tw : op.x;
  return { x, y: op.y - op.size / 2, w: tw, h: op.size };
};
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// GIF собирается слоями для любого размера: квадрат, горизонталь, портрет — те же проверки.
const gifSizes = [[300, 250], [336, 280], [250, 250], [200, 200], [300, 600], [240, 400], [580, 400], [970, 250], [1200, 628], [1080, 1080], [1080, 1350], [1080, 1920], [320, 100], [320, 480]].map(([w, h]) => ({ w, h }));
for (const s of [...sizes, ...gifSizes]) {
  const kind = gifKind(s.w, s.h);
  for (const [ti, texts] of TEXTS.entries()) {
    for (const [logo, ctaArt] of [[null, null], [{ w: 300, h: 100 }, null], [null, { w: 460, h: 130 }]] as const) {
      const name = `${s.w}×${s.h} (${kind}) тексты#${ti}${logo ? " +лого" : ""}${ctaArt ? " +кнопка-ассет" : ""}`;
      const ops = layoutBanner(s.w, s.h, kind, { texts, accent: "#f5b324", logo, ctaArt }, measure);
      const btn = ops.find((o) => o.kind === "button") as Extract<Op, { kind: "button" }> | undefined;
      const txt = ops.filter((o): o is Extract<Op, { kind: "text" }> => o.kind === "text");
      ok(!!btn, `${name}: нет кнопки`);
      for (const o of ops) if (o.kind !== "text" && o.kind !== "shade") ok(inside(o.box, s.w, s.h), `${name}: ${o.kind} за краем`);
      for (const t of txt) {
        ok(inside(textBox(t), s.w, s.h), `${name}: текст «${t.text}» за краем`);
        ok(t.size >= 7, `${name}: «${t.text}» ${t.size}px`);
        // Текст на кнопке — внутри неё; остальной — не на ней.
        if (btn) {
          const onBtn = Math.abs(t.y - (btn.box.y + btn.box.h / 2)) < 0.5 && t.align === "center" && t.x >= btn.box.x && t.x <= btn.box.x + btn.box.w;
          if (!onBtn) ok(!overlap(textBox(t), btn.box), `${name}: «${t.text}» наезжает на кнопку`);
        }
      }
      // Оффер (или заголовок, если оффера нет) — на баннере, хотя бы главным числом
      // (на крохотных полосах он сжимается: «фриспинов» → FS, «50 000» → 50K).
      const main = texts.offer || texts.headline;
      const key = /[+\-]?\d+%?/.exec(main)?.[0] ?? main.split(/\s+/)[0];
      ok(txt.some((t) => t.text.includes(key)), `${name}: нет оффера «${main}» (ищем «${key}»)`);
      // Текстовые строки не наезжают друг на друга.
      const nonBtn = txt.filter((t) => !btn || Math.abs(t.y - (btn.box.y + btn.box.h / 2)) >= 0.5);
      for (let i = 0; i < nonBtn.length; i++) for (let j = i + 1; j < nonBtn.length; j++) ok(!overlap(textBox(nonBtn[i]), textBox(nonBtn[j])), `${name}: строки «${nonBtn[i].text}» и «${nonBtn[j].text}» наезжают`);
    }
  }
}

// Персонаж отдельным слоем (GIF): внутри баннера, крупный, текст его не закрывает.
for (const s of [...sizes, ...gifSizes]) {
  const kind = gifKind(s.w, s.h);
  for (const [ti, texts] of TEXTS.entries())
    for (const hero of [{ w: 700, h: 1000 }, { w: 1000, h: 700 }]) {
      const name = `${s.w}×${s.h} (${kind}) тексты#${ti} персонаж ${hero.w}×${hero.h}`;
      const ops = layoutBanner(s.w, s.h, kind, { texts, accent: "#f5b324", hero, ctaArt: { w: 460, h: 130 } }, measure);
      const hb = (ops.find((o) => o.kind === "hero") as Extract<Op, { kind: "hero" }> | undefined)?.box;
      ok(!!hb, `${name}: нет персонажа`);
      if (!hb) continue;
      ok(inside(hb, s.w, s.h), `${name}: персонаж за краем`);
      ok(hb.h >= s.h * (kind === "strip" ? 0.55 : 0.28) || hb.w >= s.w * 0.28, `${name}: персонаж мелкий ${hb.w}×${hb.h}`);
      const txt = ops.filter((o): o is Extract<Op, { kind: "text" }> => o.kind === "text" && !o.noArt);
      ok(txt.length > 0, `${name}: нет текста`);
      for (const t of txt) {
        const tb = textBox(t);
        ok(inside(tb, s.w, s.h), `${name}: «${t.text}» за краем`);
        if (kind === "strip") ok(tb.x >= hb.x + hb.w - 1, `${name}: «${t.text}» на персонаже`);
        // В колонке текст может лишь коснуться макушки (верхние 25% рамки персонажа — обычно пустые).
        else ok(!overlap(tb, { x: hb.x, y: hb.y + hb.h * 0.25, w: hb.w, h: hb.h * 0.75 }), `${name}: «${t.text}» закрывает персонажа`);
      }
    }
}

// Кадры GIF «по очереди»: порядок; каждый кадр — своя раскладка в баннере, без наездов на кнопку.
{
  const full = { headline: "Крути колесо викингов", offer: "+200% + 500 фриспинов", cta: "Забрать бонус", sub: "Только для новых игроков" };
  const names = (o: Parameters<typeof bannerSlides>[0]) => bannerSlides(o).map((x) => x.name).join(">");
  ok(names({ texts: full, accent: "#f5b324", logo: { w: 300, h: 100 } }) === "headline>offer>sub>brand", "кадры: порядок с лого и доп-текстом");
  ok(names({ texts: { ...full, sub: "" }, accent: "#f5b324" }) === "headline>offer", "кадры: без лого и доп-текста");
  ok(bannerSlides({ texts: { headline: "", offer: "+200%", cta: "Играть" }, accent: "#f5b324" }).length === 1, "кадры: одна надпись — чередовать нечего");
  for (const s of [...sizes, ...gifSizes]) {
    const kind = gifKind(s.w, s.h);
    for (const ctaArt of [null, { w: 460, h: 130 }]) {
      for (const sl of bannerSlides({ texts: full, accent: "#f5b324", logo: { w: 300, h: 100 }, ctaArt })) {
        const name = `${s.w}×${s.h} кадр «${sl.name}»${ctaArt ? " +кнопка-ассет" : ""}`;
        const ops = layoutBanner(s.w, s.h, kind, sl.opts, measure);
        const btn = ops.find((o) => o.kind === "button") as Extract<Op, { kind: "button" }> | undefined;
        const txt = ops.filter((o): o is Extract<Op, { kind: "text" }> => o.kind === "text" && !o.noArt);
        const logo = ops.find((o) => o.kind === "logo") as Extract<Op, { kind: "logo" }> | undefined;
        ok(!!btn, `${name}: нет кнопки`);
        if (sl.name === "brand") {
          ok(!!logo && inside(logo.box, s.w, s.h), `${name}: нет лого или за краем`);
          ok(!!logo && (!btn || !overlap(logo.box, btn.box)), `${name}: лого на кнопке`);
          ok(!!logo && logo.box.h >= Math.min(s.h * 0.5, 24), `${name}: лого мелкое (${logo?.box.h}px)`);
          ok(txt.length === 0, `${name}: на кадре лого есть текст`);
        } else {
          ok(txt.length > 0, `${name}: пустой кадр`);
          ok(!logo, `${name}: лого на текстовом кадре`);
          for (const t of txt) {
            ok(inside(textBox(t), s.w, s.h), `${name}: «${t.text}» за краем`);
            ok(t.size >= 7, `${name}: «${t.text}» ${t.size}px`);
            if (btn) ok(!overlap(textBox(t), btn.box), `${name}: «${t.text}» на кнопке`);
          }
          if (sl.name === "offer" && kind === "strip") ok(txt.every((t) => t.color === "#f5b324"), `${name}: оффер не акцентом`);
        }
      }
    }
  }
}

// Сжатие оффера: кириллические окончания не остаются хвостом.
ok(compactOffer("+200% до 50 000 ₽ и 500 фриспинов") === "+200% до 50K ₽ + 500 FS", `compactOffer: ${compactOffer("+200% до 50 000 ₽ и 500 фриспинов")}`);
ok(compactOffer("Фрибет 5 000 ₽") === "FB 5K ₽", `compactOffer фрибет: ${compactOffer("Фрибет 5 000 ₽")}`);

// Надписи-ассеты: лист режется ровно на слова, тень не даёт лишней полосы.
{
  const rows = [...Array(10).fill(0), ...Array(30).fill(50), ...Array(3).fill(0), ...Array(4).fill(9), ...Array(20).fill(0), ...Array(30).fill(60), ...Array(10).fill(0)];
  const b = bandsFromAlpha(rows, 2);
  ok(!!b && b.length === 2 && b[0][0] === 10 && b[0][1] === 47 && b[1][0] === 67 && b[1][1] === 97, `bandsFromAlpha: ${JSON.stringify(b)}`);
  ok(bandsFromAlpha(rows, 3) === null, "bandsFromAlpha: 3 полосы из 2");
  // Свечение склеило две строки: режем по провалу плотности.
  const glued = [...Array(5).fill(0), ...Array(40).fill(300), ...Array(10).fill(12), ...Array(40).fill(280), ...Array(5).fill(0)];
  const g2 = bandsFromAlpha(glued, 2);
  ok(!!g2 && g2.length === 2 && g2[0][1] >= 45 && g2[0][1] <= 55, `bandsFromAlpha склейка: ${JSON.stringify(g2)}`);
  ok(sameWord("КРУТИ", "KPYTИ") && !sameWord("500", "5OO"), "sameWord");
  const tk = sheetTokens([{ text: "Крути колесо", role: "light" }, { text: "+200% до 50 000 ₽" }, { text: "Крути" }]);
  ok(tk.map((t) => t.text).join("|") === "КРУТИ|КОЛЕСО|+200%|ДО|50 000|₽" && tk[2].role === "accent", `sheetTokens: ${JSON.stringify(tk)}`);
}

// Перенос по смыслу: «+» и «и» — со следующим, предлог — с числом, число — со словом.
{
  const u = (t: string) => wrapUnits(t).map((x) => x.join(" ")).join(" | ");
  ok(u("+200% + 500 ФРИСПИНОВ") === "+200% | + 500 ФРИСПИНОВ", `wrapUnits: ${u("+200% + 500 ФРИСПИНОВ")}`);
  ok(u("+200% до 50 000 ₽ и 500 фриспинов") === "+200% | до 50 000 ₽ | и 500 фриспинов", `wrapUnits: ${u("+200% до 50 000 ₽ и 500 фриспинов")}`);
  ok(u("Крути колесо викингов") === "Крути | колесо | викингов", "wrapUnits: заголовок по словам");
}

if (fails.length) {
  console.log(fails.map((f) => "✗ " + f).join("\n"));
  console.log(`\n${fails.length} проблем, ${pass} проверок прошли`);
  process.exit(1);
}
console.log(`✓ все ${pass} проверок прошли (${sizes.length} тонких размеров + ${gifSizes.length} для GIF)`);
