// Лендинг на премиум-сцене: первый экран — сцена плейбла, ниже — блоки
// landingKit (бонусы, игры, доверие, шаги, лента, отзывы, FAQ, подвал 18+).
//
// Сцена встроена iframe-ом srcdoc того же источника: её документ со своими
// стилями (body без прокрутки, touch-action: none) не мешает странице, а
// кнопка сцены через parent.__goCta уводит на оффер так же, как кнопки
// блоков — с событиями пикселей и параметрами адреса (subid, click_id).
// Палец на сцене страницу не прокрутит, поэтому под ней — полоса «к блокам»:
// сцена занимает экран без её высоты.
//
// Две раскладки первого экрана (extras.look.sceneHero):
// - promo (по умолчанию) — шапка с лого и кнопкой; слева заголовок и оффер
//   крупно, справа (на телефоне — под ними) игра в рамке «LIVE»; фон первого
//   экрана — фон сцены от ИИ, вокруг рамки — объекты от ИИ, у оффера — награда;
//   шрифты Unbounded + Manrope, у блоков ниже — номера секций. Сцена — в режиме
//   embed: без своего лого, заголовка и юр. строки (их показывает страница);
// - full — сцена на весь экран, как раньше.

import { kitParts, type LandingExtras, type LandingKind } from "./landingKit";
import type { SceneConfig, SceneId } from "./scenes/build";

/**
 * Первый экран промо из конфига сцены: бренд, лого, фон и награда от ИИ, а вокруг
 * рамки — детали сцены от ИИ (сундук, шар, монеты…), какие есть.
 */
export function promoFromScene(cfg: SceneConfig, o: { headline: string; offer: string; cta: string; game: string }): ScenePromo {
  const floats = Object.values(cfg.art ?? {}).filter((v): v is string => typeof v === "string" && /^data:image\//.test(v));
  return { brand: cfg.brandName, logo: cfg.logo, bg: cfg.bgImage, reward: cfg.reward, floats, ...o };
}

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
  opts: { extras: LandingExtras; accent: string; ctaUrl: string; kind: LandingKind; title: string; promo?: ScenePromo },
): string {
  // Промо-раскладка: шапка, текст и оффер, игра в рамке — в первом экране.
  if (opts.promo && opts.extras.look.sceneHero !== "full") return promoPage(sceneHtml, { ...opts, promo: opts.promo });
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
  .sceneHero{position:relative;height:calc(100vh - 56px);height:calc(100svh - 56px);min-height:480px;background:#000}
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

// ---------------------------------------------------------------- промо-раскладка

/**
 * Что знает страница о кампании для первого экрана промо-раскладки.
 * Картинки — от ИИ (фон сцены, награда, парящие объекты); нет — без них.
 */
export type ScenePromo = {
  brand: string;
  logo: string;
  headline: string;
  /** Оффер уже «человеческий» (humanizeOffer): «222 фриспина + 50 000 ₽». */
  offer: string;
  cta: string;
  /** Название игры для полоски над сценой: «PLINKO». */
  game: string;
  bg?: string;
  reward?: string;
  floats?: string[];
};

const img = (u: string | undefined) => (u && /^data:image\//.test(u) ? u : "");

/** Заголовок в две строки: вторая — акцентом. Свой перенос (\n) главнее. */
function headlineHtml(h: string): string {
  const t = h.trim();
  if (!t) return "";
  const [a, b] = t.includes("\n") ? [t.slice(0, t.indexOf("\n")), t.slice(t.indexOf("\n") + 1)] : split(t);
  return b ? `${esc(a)}<br><span>${esc(b)}</span>` : `<span>${esc(a)}</span>`;
}
function split(t: string): [string, string] {
  const w = t.split(/\s+/);
  if (w.length < 2) return [t, ""];
  let best = 1;
  let bestD = Infinity;
  for (let i = 1; i < w.length; i++) {
    const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length);
    if (d < bestD) [best, bestD] = [i, d];
  }
  return [w.slice(0, best).join(" "), w.slice(best).join(" ")];
}

/** Оффер крупно: числа большими, слова к ним — мелко («222 фриспина + 50 000 ₽»). */
function offerHtml(offer: string): string {
  const parts = offer.split(/\s\+\s/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  return parts
    .map((p) => {
      const m = /^([+\-]?[\d  .,%]*\d%?)\s*(.*)$/.exec(p);
      return m ? `<span>${esc(m[1])}${m[2] ? ` <small>${esc(m[2])}</small>` : ""}</span>` : `<span class="w">${esc(p)}</span>`;
    })
    .join('<b class="plus">+</b>');
}

const PROMO_FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Unbounded:wght@600;700;800;900&display=swap">';

function promoCss(accent: string): string {
  const head = `Unbounded,"Arial Black",Arial,sans-serif`;
  const body = `Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif`;
  return `
  :root{--ac:${accent};--gold:#ffd34d}
  body{font-family:${body};color:#fff}
  .pHead{position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1180px;margin:0 auto;padding:14px 16px}
  .pLogo{display:flex;align-items:center;min-width:0;height:36px;font:900 20px/1 ${head};letter-spacing:-.01em;text-transform:uppercase;color:#fff}
  .pLogo img{max-height:36px;max-width:160px;object-fit:contain}
  .pHR{display:flex;align-items:center;gap:10px}
  .pBadge{display:none;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);font:800 11px/1 ${body};letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.75)}
  .pBadge i{width:7px;height:7px;border-radius:50%;background:var(--ac);box-shadow:0 0 10px var(--ac)}
  .pBtn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;padding:16px 22px;cursor:pointer;font:800 14px/1 ${body};letter-spacing:.06em;text-transform:uppercase;color:#0b0815;background:var(--ac);box-shadow:0 10px 30px color-mix(in srgb,var(--ac) 45%,transparent),inset 0 1px 0 rgba(255,255,255,.4)}
  .pBtn:active{transform:translateY(1px)}
  .pBtnSm{padding:11px 16px;font-size:12px;border-radius:12px}
  .pHero{position:relative;overflow:hidden;padding:8px 0 34px}
  .pBg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.32;filter:saturate(1.1);-webkit-mask-image:linear-gradient(180deg,#000 30%,transparent);mask-image:linear-gradient(180deg,#000 30%,transparent)}
  .pHero::before{content:"";position:absolute;inset:-20% -10% auto -10%;height:80%;background:radial-gradient(50% 60% at 20% 30%,color-mix(in srgb,var(--ac) 30%,transparent),transparent 70%),radial-gradient(40% 50% at 85% 40%,rgba(124,58,237,.35),transparent 70%);pointer-events:none}
  .pWrap{position:relative;z-index:2;display:grid;grid-template-areas:"copy" "game" "act";gap:18px;max-width:1180px;margin:0 auto;padding:0 16px}
  .pCopy{grid-area:copy;min-width:0}
  .pEye{display:flex;align-items:center;gap:8px;font:800 11px/1 ${body};letter-spacing:.16em;text-transform:uppercase;color:var(--ac)}
  .pEye b{color:var(--gold);font-size:14px}
  .pHero h1{margin-top:12px;font:900 clamp(30px,8.6vw,72px)/.98 ${head};letter-spacing:-.03em;text-transform:uppercase;overflow-wrap:anywhere}
  .pHero h1 span{background:linear-gradient(90deg,var(--ac),var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent}
  .pBonusT{margin-top:16px;font:800 11px/1 ${body};letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
  .pBonus{position:relative;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin-top:8px;padding-right:clamp(64px,18vw,0px);font:900 clamp(28px,7.4vw,52px)/1.05 ${head};letter-spacing:-.02em}
  .pBonus small{font-size:.42em;letter-spacing:0;color:var(--gold);text-transform:uppercase}
  .pBonus .w{font-size:.62em}
  .pBonus .plus{color:var(--ac)}
  .pBonus img{position:absolute;right:0;top:50%;width:clamp(64px,18vw,110px);transform:translateY(-55%);filter:drop-shadow(0 10px 18px rgba(0,0,0,.5));animation:pBobImg 4s ease-in-out infinite}
  .pFine{margin-top:8px;font-size:12px;color:rgba(255,255,255,.55)}
  .pGame{grid-area:game;position:relative;justify-self:center;width:100%;max-width:460px}
  .pCard{position:relative;z-index:2;border-radius:26px;padding:10px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.02));border:1px solid color-mix(in srgb,var(--ac) 45%,transparent);box-shadow:0 0 0 6px rgba(255,255,255,.02),0 30px 70px rgba(0,0,0,.55),0 0 60px color-mix(in srgb,var(--ac) 22%,transparent)}
  .pTop{display:flex;align-items:center;justify-content:space-between;padding:4px 8px 10px;font:800 10.5px/1 ${body};letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.75)}
  .pTop i{display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:#3dffb0;box-shadow:0 0 10px #3dffb0;animation:pLive 1.4s ease-in-out infinite}
  .pTop em{font-style:normal;padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.07)}
  .pFrame{height:min(68svh,620px);min-height:420px;border-radius:18px;overflow:hidden;background:#000}
  .pFrame iframe{display:block;width:100%;height:100%;border:0}
  .pFl{position:absolute;z-index:1;width:clamp(56px,14vw,96px);filter:drop-shadow(0 12px 18px rgba(0,0,0,.5));animation:pBob 5s ease-in-out infinite;pointer-events:none}
  .pFl.a{left:-6%;top:12%}.pFl.b{right:-7%;top:46%;animation-delay:-1.6s}.pFl.c{left:-4%;bottom:6%;animation-delay:-3s}
  .pAct{grid-area:act;display:flex;flex-direction:column;gap:12px}
  .pAct .pBtn{width:100%;max-width:420px;font-size:15px;padding:18px 22px}
  .pTrust{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:rgba(255,255,255,.6)}
  .pTrust span::before{content:"✓";margin-right:6px;color:var(--ac);font-weight:800}
  @keyframes pBob{50%{transform:translateY(-10px) rotate(-3deg)}}
  @keyframes pBobImg{50%{transform:translateY(calc(-55% - 8px)) rotate(-4deg)}}
  @keyframes pLive{50%{opacity:.35}}
  @media(min-width:640px){.pBadge{display:inline-flex}}
  @media(min-width:960px){
    .pHero{padding:24px 0 64px}
    .pWrap{grid-template-columns:1.05fr .95fr;grid-template-areas:"copy game" "act game";column-gap:48px;align-items:center}
    .pAct{align-self:start}
    .pAct .pBtn{width:auto}
    .pFrame{height:min(76vh,720px)}
    .pBonus{padding-right:0}
    .pBonus img{position:static;transform:none;margin-left:6px;animation-name:pBob}
  }
  @media(prefers-reduced-motion:reduce){.pFl,.pBonus img,.pTop i{animation:none}}
  /* Блоки ниже — тем же шрифтом и с номерами секций, как в первом экране. */
  .ex{font-family:${body};counter-reset:psec}
  .ex h2{font-family:${head};letter-spacing:-.02em;text-transform:uppercase}
  .ex section{counter-increment:psec}
  .ex section>h2::before{content:counter(psec,decimal-leading-zero) " /";display:block;margin-bottom:10px;font:800 12px/1 ${body};letter-spacing:.18em;color:var(--ac);-webkit-text-fill-color:var(--ac)}
  `;
}

function promoPage(sceneHtml: string, opts: { extras: LandingExtras; accent: string; ctaUrl: string; kind: LandingKind; title: string; promo: ScenePromo }): string {
  const extras: LandingExtras = { ...opts.extras, look: { ...opts.extras.look, intro: false, lines: "off", floaters: false } };
  const k = kitParts(extras, opts.accent, true, opts.ctaUrl, opts.kind);
  const s = k.strings;
  const p = opts.promo;
  const logo = img(p.logo) ? `<img src="${p.logo}" alt="${esc(p.brand)}"/>` : esc(p.brand || "LOGO");
  const floats = (p.floats ?? []).map(img).filter(Boolean).slice(0, 3);
  const cta = esc(p.cta || s.claimNow);
  return `<!doctype html>
<html lang="${k.lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${esc(opts.title)}</title>
${PROMO_FONTS}
${k.head}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#0b0815}
${promoCss(/^#[0-9a-fA-F]{6}$/.test(opts.accent) ? opts.accent : "#3dffb0")}
${k.css}
</style>
</head>
<body>
  <header class="pHead"><span class="pLogo">${logo}</span><div class="pHR"><span class="pBadge"><i></i>${esc(s.promoBadge)}</span><button type="button" class="pBtn pBtnSm" data-excta>${cta} ↗</button></div></header>
  <section class="pHero">
    ${img(p.bg) ? `<div class="pBg" style="background-image:url('${p.bg}')"></div>` : ""}
    <div class="pWrap">
      <div class="pCopy">
        <div class="pEye"><b>✦</b>${esc(s.promoEyebrow)}</div>
        <h1>${headlineHtml(p.headline)}</h1>
        ${p.offer.trim() ? `<div class="pBonusT">${esc(s.promoBonus)}</div><div class="pBonus">${offerHtml(p.offer)}${img(p.reward) ? `<img src="${p.reward}" alt=""/>` : ""}</div><p class="pFine">${esc(s.promoFine)}</p>` : ""}
      </div>
      <div class="pGame">
        ${floats.map((u, i) => `<img class="pFl ${"abc"[i]}" src="${u}" alt=""/>`).join("")}
        <div class="pCard"><div class="pTop"><span><i></i>${esc(p.game)} LIVE</span><em>${esc(s.promoDemo)}</em></div><div class="pFrame"><iframe title="${esc(p.game)}" srcdoc="${esc(sceneHtml)}" allow="autoplay; fullscreen"></iframe></div></div>
      </div>
      <div class="pAct"><button type="button" class="pBtn" data-excta>${cta} ↗</button><div class="pTrust"><span>${esc(s.promoTrust1)}</span><span>${esc(s.promoTrust2)}</span></div></div>
    </div>
  </section>
  ${k.after}
  ${k.script}
</body>
</html>`;
}
