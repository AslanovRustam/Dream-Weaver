"use client";

// Простой режим механик (колесо, слот, crash, матч): из понятого ТЗ — всё, что
// нужно лендингу. Порядок решений: что решил лендинг-хаб (decided) → план
// движка ТЗ (job.plan) → общая часть задания → тексты от ИИ на языке ТЗ.
//
// Здесь только тексты, язык, бренд и промпты картинок. Состояние страницы
// заполняет сама механика (apply), графику рисует её обычная сборка.
import { apiFetch } from "@/lib/api-client";
import { lookupBrand } from "@/lib/brandLookup";
import { applyFlat, flatten, kitStringsFrom, type CampaignI18n } from "@/lib/campaignI18n";
import { EU_LANGS, isBuiltInLang } from "@/lib/euLangs";
import { applyBlockTexts, blocksFor, enabledBlocks, type BlockId } from "@/components/landing/LandingBlocksPicker";
import { topicHasPair } from "@/components/landing/ApplyTopicButton";
import { landingStrings, relocalizeExtras, stripExtrasImages, type LandingExtras, type LandingKind } from "@/lib/landingKit";
import { humanizeOffer } from "@/lib/offerText";
import { CHARACTER_PRICE_CREDITS, imageCredits, SLOT_SYMBOLS_PRICE_CREDITS } from "@/lib/credit-estimate";
import { tzImage, tzImageByRole, type TzUnderstood } from "@/lib/tz/client";

export type MechanicId = "wheel" | "slot" | "crash" | "match";

/** Поле механики для копирайтера: ключ, что это (по-английски), пример. */
export type CopyField = { key: string; label: string; value: string };

/** Что решено по ТЗ — механика раскладывает это по своим полям. */
export type MechanicPlan = {
  u: TzUnderstood;
  /** Решения хаба поверх job.plan — для полей конкретной механики (prizes, teams…). */
  raw: Record<string, unknown>;
  headline: string;
  sub: string;
  cta: string;
  /** Оффер так, как его прочтёт игрок (сокращения ТЗ раскрыты). */
  offer: string;
  /** Тема по-русски: для подсказок картинок блоков и полей «Тематика». */
  topic: string;
  /** Язык ТЗ (код) и как собрана страница. */
  language: string;
  pageLang: string;
  brand: { name: string; logo: string; site: string };
  /** Акцент из ТЗ / сайта бренда; пусто — оставить как есть. */
  accent: string;
  extras: LandingExtras;
  /** Промпты картинок: фон, персонажи (пусто — без персонажа), иконки механики. */
  bg: string;
  chars: { left: string; right: string };
  icon: string;
  /** Референс стиля из ТЗ (картинка) — для фона и персонажей (i2i). */
  ref: string;
  /** Главный визуал из ТЗ (игра, слот) — референс иконок механики. */
  mainRef: string;
  /** Тексты полей механики от копирайтера. */
  scene: Record<string, string>;
  why: string;
  /** Что пришлось решить самим — в карточку. */
  notes: string[];
};

export const str = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const HEX = /^#[0-9a-f]{6}$/i;
const TYPE_LABEL: Record<string, string> = {
  wheel: "колесо фортуны",
  slot: "слот-машина",
  crash: "crash-игра",
  match: "матч-прогноз",
  scene: "лендинг-сцена",
  blocks: "блочный лендинг",
};
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Первое непустое значение по ключам. */
export const pick = (src: Record<string, unknown>, keys: string[], max = 300) => {
  for (const k of keys) {
    const v = str(src[k], max);
    if (v) return v;
  }
  return "";
};

/** Список строк из плана (prizes, symbols, blocks…): массив строк или объектов с label/title. */
export const pickList = (src: Record<string, unknown>, keys: string[], max = 40): string[] => {
  for (const k of keys) {
    const v = src[k];
    if (!Array.isArray(v)) continue;
    const out = v
      .map((x) => (typeof x === "string" ? str(x, max) : pick(obj(x), ["label", "title", "text", "name"], max)))
      .filter(Boolean);
    if (out.length) return out;
  }
  return [];
};

/** Язык страницы: готовый набор (ru/uk/en/es), перевод английского набора или английский с <html lang>. */
function langOf(code: string): { base: "ru" | "uk" | "en" | "es"; code: string; translate: boolean } {
  const c = (code || "ru").toLowerCase().split(/[-_]/)[0];
  if (isBuiltInLang(c)) return { base: c, code: c, translate: false };
  return { base: "en", code: c, translate: EU_LANGS.some((l) => l.id === c) };
}

async function post<T>(route: string, json: unknown): Promise<T | null> {
  try {
    const res = await apiFetch(route, { method: "POST", json });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Лого с сайта бывает SVG — в PNG, как делает «Найти по сайту». */
function toPng(src: string, maxPx = 256): Promise<string> {
  if (!src.startsWith("data:image/svg")) return Promise.resolve(src);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxPx / Math.max(img.naturalWidth || maxPx, img.naturalHeight || maxPx));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((img.naturalWidth || maxPx) * k));
      c.height = Math.max(1, Math.round((img.naturalHeight || maxPx) * k));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

const suggest = (topic: string, field: "bg" | "character" | "icon", mechanic: MechanicId, side?: "left" | "right") =>
  post<{ text?: string }>("/api/landing-suggest", { topic: topic.slice(0, 500), field, mechanic, side }).then((d) => str(d?.text, 600));

export async function buildMechanicPlan(o: {
  u: TzUnderstood;
  decided?: Record<string, unknown>;
  mechanic: MechanicId;
  kind: LandingKind;
  /** Текущие блоки страницы — трекинг и выбор блоков сохраняем. */
  extras: LandingExtras;
  /** Поля механики для копирайтера (кроме общих headline/cta). */
  fields: (ctx: { offer: string; raw: Record<string, unknown> }) => CopyField[];
  /** Нужен ли промпт иконок механики (символы слота, ракета, эмблемы). */
  icon?: boolean;
  /** Что сейчас в кнопке — пример длины для копирайтера. */
  cta: string;
  /** Живой ход: строки для журнала шага. */
  log?: (m: string) => void;
  /** Правка текстов словами: переписываем только тексты, остальное — из base. */
  edit?: { text: string; base: MechanicPlan };
}): Promise<MechanicPlan> {
  const { u, mechanic, kind, edit } = o;
  const log = o.log ?? (() => {});
  const job = u.job;
  // Хаб решил тексты сам — его решения главнее плана движка. При правке тексты пишем заново.
  const raw: Record<string, unknown> = { ...obj(job.plan), ...obj(o.decided) };
  if (edit) for (const k of ["headline", "title", "cta", "ctaText", "button", "sub", "subheadline", "subtitle"]) delete raw[k];
  const L = langOf(pick(raw, ["language"], 8) || job.language);
  const notes: string[] = edit ? [...edit.base.notes] : [];
  // Движок мог счесть, что ТЗ лучше подходит другой лендинг: собираем тот, что открыт, но говорим.
  const planType = str(obj(job.plan).type, 12);
  const sameType = !planType || planType === mechanic || !!o.decided;
  if (!sameType && !edit) notes.push(`По ТЗ лучше подошёл бы другой лендинг (${TYPE_LABEL[planType] ?? planType}) — собрал ${TYPE_LABEL[mechanic]}, как вы открыли.`);

  const offerRaw = pick(raw, ["offer"], 200) || str(job.offer, 200);
  const offer = offerRaw ? humanizeOffer(offerRaw, L.code) : "";
  const exactCta = edit ? "" : job.requirements.find((r) => r.exact && /cta|кнопк|button/i.test(r.text))?.exact ?? "";

  // Тема одной строкой: суть, оффер, стиль, что на референсах.
  const refNotes = job.images
    .filter((i) => i.role === "style" || i.role === "main" || i.role === "character")
    .map((i) => i.note)
    .filter(Boolean)
    .slice(0, 3);
  const topic = [
    job.summary,
    pick(raw, ["occasion"], 40) && `Повод: ${pick(raw, ["occasion"], 40)}`,
    offer && `Оффер: ${offer}`,
    job.brand.name && `Бренд: ${job.brand.name}`,
    job.style.direction && `Стиль: ${job.style.direction}`,
    job.style.mood && `Настроение: ${job.style.mood}`,
    // scene в плане хаба — id сцены (plinko…), не описание: его не берём.
    pick(raw, ["visual", "background", "bg"], 200) && `Сцена: ${pick(raw, ["visual", "background", "bg"], 200)}`,
    refNotes.length ? `Референсы: ${refNotes.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");
  const short = topic.slice(0, 300);
  const visual = [topic, job.style.palette.length ? `Палитра: ${job.style.palette.join(", ")}` : ""].filter(Boolean).join(". ");

  // Блоки: при правке — как были; иначе что выбрал план (если выбрал), иначе как сейчас на странице.
  // Картинки блоков прошлой темы — не к этому ТЗ: сборка нарисует новые.
  let x: LandingExtras = edit ? edit.base.extras : relocalizeExtras(stripExtrasImages(o.extras), L.base, kind);
  if (!edit) {
    // kitBlocks — блоки под первым экраном механики (plans/landing.ts); blocks там — для блочного лендинга.
    const planBlocks = pickList(raw, ["kitBlocks"], 24).map((b) => b.toLowerCase());
    const known = blocksFor(kind).map((b) => b.id);
    const chosen = planBlocks.filter((b): b is BlockId => (known as string[]).includes(b));
    if (chosen.length) {
      const on = new Set<BlockId>(chosen);
      if (offer) on.add("bonuses");
      const next = { ...x } as unknown as Record<string, { on: boolean }>;
      for (const id of known) next[id] = { ...next[id], on: on.has(id) };
      x = next as unknown as LandingExtras;
    } else if (offer && !x.bonuses.on) {
      x = { ...x, bonuses: { ...x.bonuses, on: true } };
    }
  }
  const blocks = enabledBlocks(x, kind);

  const fields = [
    { key: "cta", label: "button text, 1-3 words, upper case", value: (edit ? edit.base.cta : o.cta) || "PLAY" },
    ...o.fields({ offer, raw }),
  ].slice(0, 16);

  // Сайт бренда: из ТЗ или ссылка с ролью brand. Лого ищем, только если его не приложили.
  const logoFromTz = tzImageByRole(u, "brand");
  const site = job.brand.site || job.links.find((l) => l.role === "brand")?.url || "";
  const pairNamed = topicHasPair(job.summary) || job.images.filter((i) => i.role === "character").length > 1 || /2|two|два|двое|пара/i.test(pick(raw, ["characters"], 40));
  const wantLookup = !edit && !!site && (!logoFromTz || !job.brand.name);

  log(edit ? `Переписываю тексты с правкой: «${edit.text}»` : `Пишу заголовок, кнопку и призы на языке «${L.code}»${blocks.length ? `, тексты блоков (${blocks.length})` : ""}`);
  if (!edit) log(`Подбираю сцену фона${o.icon ? ", иконки механики" : ""} и персонажа${pairNamed ? "ей" : ""} под стиль ТЗ`);
  if (wantLookup) log(`Ищу лого и цвет бренда на ${site}`);
  if (L.translate && !edit) log(`Перевожу подписи механики и блоков (${L.code})`);

  const say = <T,>(p: Promise<T>, msg: (v: T) => string) =>
    p.then((v) => {
      const m = msg(v);
      if (m) log(m);
      return v;
    });
  const none = Promise.resolve("");

  // Всё независимое — разом: тексты, перевод подписей, промпты картинок, бренд.
  const [copy, tr, bg, charL, charR, icon, found] = await Promise.all([
    say(
      post<{ copy?: { headline?: string; scene?: Record<string, string>; blocks?: Record<string, Record<string, unknown>> } }>("/api/campaign-copy", {
        topic: (edit ? `ПРАВКА КЛИЕНТА (учесть обязательно): ${edit.text}. ${short}` : short || offer || "casino promo").slice(0, 300),
        brief: [edit ? `Правка клиента: ${edit.text}.` : "", job.summary, ...job.requirements.filter((r) => r.kind === "text" || r.kind === "offer").map((r) => r.text)]
          .filter(Boolean)
          .join(" ")
          .slice(0, 600),
        kind,
        lang: L.code,
        brand: job.brand.name,
        offer: offerRaw,
        cta: pick(raw, ["cta", "ctaText", "button"], 24) || exactCta,
        parts: { landing: true, playable: true, email: false, banner: false },
        scene: { id: mechanic, fields },
        blocks: edit ? [] : blocks,
      }).then((d) => d?.copy ?? null),
      (c) => (c?.headline ? `Тексты готовы: «${c.headline}»` : "Тексты от ИИ не пришли — беру тексты из ТЗ"),
    ),
    L.translate && !edit
      ? (() => {
          const src: CampaignI18n = {};
          flatten(landingStrings("en"), "kit", src);
          const plain: Partial<LandingExtras> = { ...x };
          delete plain.tracking;
          delete plain.look;
          flatten(plain, "extras", src);
          return post<{ texts?: CampaignI18n }>("/api/translate-texts", { lang: L.code, texts: src }).then((d) => d?.texts ?? null);
        })()
      : Promise.resolve(null),
    edit ? Promise.resolve(edit.base.bg) : say(suggest(visual, "bg", mechanic), (t) => (t ? "Сцена фона готова" : "")),
    edit ? Promise.resolve(edit.base.chars.left) : say(suggest(visual, "character", mechanic, "left"), (t) => (t ? "Персонаж придуман" : "")),
    edit ? Promise.resolve(edit.base.chars.right) : pairNamed ? suggest(visual, "character", mechanic, "right") : none,
    edit ? Promise.resolve(edit.base.icon) : o.icon ? suggest(visual, "icon", mechanic) : none,
    wantLookup
      ? say(
          lookupBrand(site).catch(() => null),
          (f) => (f ? `Бренд с сайта: ${f.brand_name || site}` : "Сайт бренда не открылся — лого не нашли"),
        )
      : Promise.resolve(null),
  ]);

  // Язык без готовых подписей: перевод английского набора, иначе — английский с <html lang>.
  if (!edit) {
    if (L.translate && tr) x = { ...applyFlat(x, "extras", tr), strings: kitStringsFrom(tr), htmlLang: L.code };
    else if (L.code !== L.base) {
      x = { ...x, htmlLang: L.code };
      notes.push("Подписи механики и блоков — на английском: готового перевода на язык ТЗ нет.");
    }
  }
  if (copy?.blocks && Object.keys(copy.blocks).length) x = applyBlockTexts(x, copy.blocks);
  // Оффер — первой карточкой бонусов: его показывает первый экран.
  if (offer && !edit) {
    // Длинный оффер: короткая версия от копирайтера, иначе первая часть оффера (не шаблонный бонус).
    const copied = copy?.blocks?.bonuses ? x.bonuses.items[0]?.title?.trim() : "";
    const head = offerParts(offer)[0] ?? "";
    const title = offer.length <= 40 ? offer : copied || (head.length <= 40 ? head : offer.slice(0, 40).trim());
    const sub = pick(raw, ["sub", "subheadline", "subtitle"], 120);
    x = {
      ...x,
      bonuses: {
        ...x.bonuses,
        on: true,
        items: x.bonuses.items.map((it, i) => (i === 0 ? { ...it, title, ...(sub ? { text: sub } : {}) } : it)),
      },
    };
  } else if (!offer && !edit) notes.push("В ТЗ нет оффера — бонусы на странице общие, проверьте их.");
  if (job.legal.length && !edit) x = { ...x, legal: job.legal.join(" · ").slice(0, 300) };

  const headline = pick(raw, ["headline", "title"], 60) || str(copy?.headline, 60) || (edit?.base.headline ?? "");
  const cta = pick(raw, ["cta", "ctaText", "button"], 24) || exactCta || str(copy?.scene?.cta, 24) || (edit?.base.cta ?? "");

  if (edit) {
    // Правка текстов: бренд, цвет, картинки и референсы — как были.
    return { ...edit.base, headline, cta, extras: x, scene: { ...edit.base.scene, ...(copy?.scene ?? {}) }, notes };
  }

  // Цвет: из ТЗ, иначе с сайта бренда.
  const accent =
    [...job.brand.colors, ...job.style.palette].find((c) => HEX.test(c)) ||
    (found && HEX.test(found.accent_color_hex) ? found.accent_color_hex : "");

  const logo = logoFromTz || (found?.is_clean_logo && found.logo_data_url ? await toPng(found.logo_data_url) : "");
  if (found && !found.is_clean_logo) notes.push("На сайте бренда не нашлось чистого логотипа — на странице название текстом.");

  // Референс для фона и персонажей: стиль → главный визуал → персонаж.
  const refId =
    job.images.find((i) => i.role === "style")?.id ?? job.images.find((i) => i.role === "main")?.id ?? job.images.find((i) => i.role === "character")?.id;

  const fallbackBg = [job.style.direction, job.style.mood, job.style.palette.join(", ")].filter(Boolean).join(", ");
  if (!bg && !fallbackBg) notes.push("Фон по умолчанию: подобрать сцену по ТЗ не удалось.");

  return {
    u,
    raw,
    headline,
    sub: pick(raw, ["sub", "subheadline", "subtitle"], 120),
    cta,
    offer,
    topic: short,
    language: job.language,
    pageLang: L.code,
    brand: { name: job.brand.name || found?.brand_name || "", logo, site },
    accent,
    extras: x,
    bg: bg || fallbackBg,
    chars: { left: charL, right: charR },
    icon,
    ref: tzImage(u, refId),
    mainRef: tzImageByRole(u, "main"),
    scene: copy?.scene ?? {},
    why: sameType ? pick(raw, ["why"], 240) : "",
    notes,
  };
}

/** Оффер по частям («100% + 200 FS» → две части) — для призов по попыткам. */
export function offerParts(offer: string, max = 3): string[] {
  return offer
    .split(/\s*(?:\+|＋|&|,(?=\s)|;|\s(?:и|та|and|y|und|et|e|i)\s)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, max);
}

// ---- Цена графики -----------------------------------------------------------

export type ArtPart = { id: string; label: string; credits: number };

/** Картинки блоков: то же, что соберёт useExtrasAssets.allSteps (по сетке на блок). */
export function extrasArt(x: LandingExtras): ArtPart[] {
  const out: ArtPart[] = [];
  if (x.bonuses.on && x.bonuses.items.some((b) => b.title.trim())) out.push({ id: "x-bonuses", label: "картинки бонусов", credits: SLOT_SYMBOLS_PRICE_CREDITS });
  if (x.games.on && x.games.items.some((g) => g.title.trim())) out.push({ id: "x-games", label: "обложки игр", credits: SLOT_SYMBOLS_PRICE_CREDITS });
  if (x.look.floaters) out.push({ id: "x-floaters", label: "парящие объекты", credits: SLOT_SYMBOLS_PRICE_CREDITS });
  return out;
}

/** Вся графика по плану: фон, персонажи, своё у механики, картинки блоков. */
export function planArt(p: MechanicPlan, mechanicParts: ArtPart[]): ArtPart[] {
  return [
    { id: "bg", label: "фон", credits: BG_CREDITS },
    ...(p.chars.left.trim() ? [{ id: "char-left", label: "персонаж слева", credits: CHARACTER_PRICE_CREDITS }] : []),
    ...(p.chars.right.trim() ? [{ id: "char-right", label: "персонаж справа", credits: CHARACTER_PRICE_CREDITS }] : []),
    ...mechanicParts,
    ...extrasArt(p.extras),
  ];
}

export const BG_CREDITS = imageCredits(1);
export const sumCredits = (parts: ArtPart[]) => parts.reduce((s, x) => s + x.credits, 0);
export const costNote = (parts: ArtPart[]) => parts.map((x) => `${x.label} ${x.credits}`).join(" + ");

// ---- Правка словами ---------------------------------------------------------

/** Что задевает правка: тексты, фон, персонажи, иконки механики. */
export function editTargets(text: string): { texts: boolean; bg: boolean; chars: boolean; icon: boolean } {
  const t = text.toLowerCase();
  const r = {
    texts: /заголов|текст|кнопк|надпис|cta|приз|сектор|бонус|оффер|слоган|призыв|перевод|язык|headline|button|copy/.test(t),
    bg: /фон|сцен|небо|атмосфер|освещ|background|scene|темн|светл|цвет/.test(t),
    chars: /персонаж|маскот|девушк|мужчин|женщин|парень|герой|болельщик|character|mascot/.test(t),
    icon: /иконк|символ|ракет|эмблем|герб|логотип команд|crest|rocket|symbol|icon/.test(t),
  };
  // Ничего не узнали — правим картинку фона и тексты: так правка точно будет видна.
  if (!r.texts && !r.bg && !r.chars && !r.icon) return { texts: true, bg: true, chars: false, icon: false };
  return r;
}

/** Правка в промпт картинки: дописываем как обязательное требование. */
export const withEdit = (prompt: string, edit: string) => (prompt.trim() ? `${prompt.trim()}. MUST: ${edit}` : edit);

/** Новые блоки при правке, но картинки — уже нарисованные на странице. */
export function keepExtrasImages(next: LandingExtras, cur: LandingExtras): LandingExtras {
  return {
    ...next,
    bonuses: { ...next.bonuses, items: next.bonuses.items.map((b, i) => ({ ...b, image: cur.bonuses.items[i]?.image ?? b.image })) },
    games: { ...next.games, items: next.games.items.map((g, i) => ({ ...g, image: cur.games.items[i]?.image ?? g.image })) },
    look: { ...next.look, floatImgs: cur.look.floatImgs ?? next.look.floatImgs },
  };
}
