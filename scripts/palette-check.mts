// Проверка палитры по картинке (src/lib/imagePalette.ts) на синтетических картинках.
//
//   npx tsx scripts/palette-check.mts
//
// Красная картинка даёт красный тон, синяя — синий, серая — «серебро»; две
// цветные зоны — два тона; все цвета — валидный hex (сборка сцены отбрасывает
// палитру с кривым цветом и откатывается к пресету).

import { accentFromPalette, paletteFromPixels, uiFromPalette, wheelFromPalette } from "../src/lib/imagePalette";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};

/** 64×64: доля пикселей одного цвета, остальное — второго. */
function img(a: [number, number, number], b: [number, number, number] = a, share = 1): Uint8ClampedArray {
  const px = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const c = i < 64 * 64 * share ? a : b;
    px.set([c[0], c[1], c[2], 255], i * 4);
  }
  return px;
}
const near = (h: number | null, want: number, tol = 15) => h !== null && Math.min(Math.abs(h - want), 360 - Math.abs(h - want)) <= tol;
// Плашки — с прозрачностью (#rrggbbaa), остальное — #rrggbb.
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

const red = paletteFromPixels(img([210, 30, 40]));
check("красная → красный тон", near(red.hue, 357, 12), String(red.hue));
const blue = paletteFromPixels(img([30, 80, 220]));
check("синяя → синий тон", near(blue.hue, 224), String(blue.hue));
const grey = paletteFromPixels(img([90, 92, 98]));
check("серая → без тона (серебро)", grey.hue === null);
const dark = paletteFromPixels(img([12, 10, 14], [200, 160, 30], 0.92));
check("тёмная с золотыми деталями → золото", near(dark.hue, 45, 15), String(dark.hue));
const two = paletteFromPixels(img([200, 40, 200], [40, 200, 90], 0.6));
check("две зоны → два тона", near(two.hue, 300) && near(two.hue2, 140, 20), `${two.hue} / ${two.hue2}`);

for (const [name, p] of [["красная", red], ["серая", grey], ["две зоны", two]] as const) {
  const ui = uiFromPalette(p);
  const wh = wheelFromPalette(p);
  const all = [...Object.values(ui), ...wh.a, ...wh.b, ...wh.win, wh.line, wh.ink, wh.stroke, wh.winInk, wh.winStroke, accentFromPalette(p)];
  check(`${name}: все цвета — hex`, all.every((c) => HEX.test(c)), all.find((c) => !HEX.test(c)) ?? "");
}

const bluePlate = uiFromPalette(blue).plate1 ?? "";
check("синяя → плашка тёмно-синяя, не коричневая", /^#[0-9a-f]{8}$/.test(bluePlate) && parseInt(bluePlate.slice(5, 7), 16) > parseInt(bluePlate.slice(1, 3), 16), bluePlate);

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
