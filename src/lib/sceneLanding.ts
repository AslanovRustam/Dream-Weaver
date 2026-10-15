// Лендинг на премиум-сцене: первый экран — сцена плейбла, ниже — блоки
// landingKit (бонусы, игры, доверие, шаги, лента, отзывы, FAQ, подвал 18+).
//
// Сцена встроена iframe-ом srcdoc того же источника: её документ со своими
// стилями (body без прокрутки, touch-action: none) не мешает странице, а
// кнопка сцены через parent.__goCta уводит на оффер так же, как кнопки
// блоков — с событиями пикселей и параметрами адреса (subid, click_id).
// Палец на сцене страницу не прокрутит, поэтому под ней — полоса «к блокам»:
// сцена занимает экран без её высоты.

import { kitParts, type LandingExtras, type LandingKind } from "./landingKit";
import type { SceneId } from "./scenes/build";

/** Баскетбол, пенальти и викторина — под спорт, остальные сцены — казино. */
export function sceneLandingKind(scene: SceneId): LandingKind {
  return scene === "basket" || scene === "penalty" || scene === "quiz" ? "sport" : "casino";
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapSceneLanding(
  sceneHtml: string,
  opts: { extras: LandingExtras; accent: string; ctaUrl: string; kind: LandingKind; title: string },
): string {
  // Своя анимация, линии и объекты первого экрана — у механик; у сцены своя хореография.
  const extras: LandingExtras = { ...opts.extras, look: { ...opts.extras.look, intro: false, lines: "off", floaters: false } };
  const k = kitParts(extras, opts.accent, true, opts.ctaUrl, opts.kind);
  return `<!doctype html>
<html lang="${k.lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${esc(opts.title)}</title>
${k.head}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#0b0815}
  .sceneHero{position:relative;height:calc(100svh - 56px);min-height:480px;background:#000}
  .sceneHero iframe{display:block;width:100%;height:100%;border:0}
  .sceneMore{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:56px;border:0;cursor:pointer;color:#fff;background:linear-gradient(180deg,#000,#0b0815);font:800 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}
  .sceneMore svg{width:18px;height:18px;animation:smBob 1.4s ease-in-out infinite}
  @keyframes smBob{50%{transform:translateY(4px)}}
  @media (prefers-reduced-motion:reduce){.sceneMore svg{animation:none}}
${k.css}
</style>
</head>
<body>
  <div class="sceneHero"><iframe title="${esc(opts.title)}" srcdoc="${esc(sceneHtml)}" allow="autoplay; fullscreen"></iframe></div>
  <button type="button" class="sceneMore" onclick="var e=document.querySelector('.ex');if(e)e.scrollIntoView({behavior:'smooth'})">${esc(k.strings.more)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  ${k.after}
  ${k.script}
</body>
</html>`;
}
