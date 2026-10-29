// Тонкие форматы баннеров: раскладка слоями (src/lib/bannerLayers.ts).
//
//   npx tsx scripts/banner-layers-check.mts
//
// Для всех размеров каталога, которые собираются слоями, и для коротких/длинных
// текстов проверяем раскладку без браузера (ширина строки — оценка по числу знаков):
// всё внутри баннера, кнопка есть и не наезжает на текст, текст не мельче 7 px,
// оффер виден. Сама отрисовка на canvas — в браузере, тут не нужна.

import { BANNER_SIZE_GROUPS } from "../src/lib/bannerSizes";
import { compactOffer, layerKind, layoutBanner, type Box, type Measure, type Op } from "../src/lib/bannerLayers";

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

for (const s of sizes) {
  const kind = layerKind(s.w, s.h)!;
  for (const [ti, texts] of TEXTS.entries()) {
    for (const logo of [null, { w: 300, h: 100 }]) {
      const name = `${s.w}×${s.h} (${kind}) тексты#${ti}${logo ? " +лого" : ""}`;
      const ops = layoutBanner(s.w, s.h, kind, { texts, accent: "#f5b324", logo }, measure);
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

// Сжатие оффера: кириллические окончания не остаются хвостом.
ok(compactOffer("+200% до 50 000 ₽ и 500 фриспинов") === "+200% до 50K ₽ + 500 FS", `compactOffer: ${compactOffer("+200% до 50 000 ₽ и 500 фриспинов")}`);
ok(compactOffer("Фрибет 5 000 ₽") === "FB 5K ₽", `compactOffer фрибет: ${compactOffer("Фрибет 5 000 ₽")}`);

if (fails.length) {
  console.log(fails.map((f) => "✗ " + f).join("\n"));
  console.log(`\n${fails.length} проблем, ${pass} проверок прошли`);
  process.exit(1);
}
console.log(`✓ все ${pass} проверок прошли (${sizes.length} размеров слоями)`);
