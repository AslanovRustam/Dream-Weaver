// Per-product field schemas used by the brief (ТЗ) parser. The LLM is given the
// brief text + one of these schemas and returns values for the keys it can fill.
// Keys match what each generator's `applyBrief` maps into its own state.
import type { SectionId } from "@/lib/sections";

export interface BriefField {
  key: string;
  label: string;
  hint?: string;
  enum?: string[]; // if set, the value must be one of these
}

export interface BriefSchema {
  fields: BriefField[];
  /** What "generate the product" should produce a prompt for. */
  genHint: string;
}

export const BRIEF_SCHEMAS: Record<SectionId, BriefSchema> = {
  banner: {
    genHint: "статичный рекламный баннер",
    fields: [
      { key: "prompt", label: "Описание", hint: "суть креатива: что рекламируем, оффер, тематика" },
      { key: "brand", label: "Бренд", hint: "название бренда/проекта" },
      { key: "bannerText", label: "Текст на баннере", hint: "короткий заголовок ≤50 симв." },
      { key: "buttonText", label: "Текст кнопки", hint: "CTA ≤24 симв." },
    ],
  },
  email: {
    genHint: "email-письмо для рассылки",
    fields: [
      { key: "name", label: "Название письма", hint: "внутреннее рабочее имя" },
      { key: "subject", label: "Тема письма" },
      { key: "preheader", label: "Прехедер", hint: "короткая строка после темы" },
      { key: "brand", label: "Бренд" },
      { key: "style", label: "Стиль", enum: ["promo", "newsletter", "announcement", "minimal"] },
      { key: "heroTitle", label: "Заголовок" },
      { key: "heroSubtitle", label: "Подзаголовок" },
      { key: "body", label: "Текст письма" },
      { key: "ctaText", label: "Текст кнопки" },
      { key: "ctaUrl", label: "Ссылка кнопки" },
      { key: "footer", label: "Футер" },
    ],
  },
  landing: {
    genHint: "лендинг",
    fields: [
      { key: "subject", label: "Тематика" },
      { key: "occasion", label: "Повод / оффер" },
      { key: "brandName", label: "Бренд" },
      { key: "ctaText", label: "Текст кнопки" },
      { key: "offerDetails", label: "Детали оффера" },
    ],
  },
  playable: {
    genHint: "интерактивный playable-баннер",
    fields: [
      { key: "subject", label: "Тематика / игра" },
      { key: "brand", label: "Бренд" },
      { key: "ctaText", label: "Текст кнопки" },
    ],
  },
  video: {
    genHint: "рекламное видео",
    fields: [
      { key: "subject", label: "Тематика / сценарий" },
      { key: "brand", label: "Бренд" },
      { key: "ctaText", label: "Текст кнопки" },
    ],
  },
  ads: { genHint: "", fields: [] },
  stats: { genHint: "", fields: [] },
  mailing: { genHint: "", fields: [] },
};

export interface BriefResult {
  fields: Record<string, string>;
  generationPrompt: string;
  /** Баннер: ТЗ сплавлено с шаблоном — что усилили (поле «Описание» уже усиленное). */
  enhanced?: { ideas: string[]; template: string } | null;
}

/**
 * ТЗ кампании «всё в одном»: тематика и всё, что кампания умеет взять из ТЗ.
 * Кампания — не раздел (SectionId), поэтому схема отдельно; parse-brief
 * принимает product: "campaign".
 */
export const CAMPAIGN_BRIEF_SCHEMA: BriefSchema = {
  genHint: "рекламная кампания iGaming: лендинг, плейбл, письмо и баннер в одной теме",
  fields: [
    { key: "topic", label: "Тематика", hint: "сеттинг/тема кампании, ТОЛЬКО если ТЗ её называет (например, Хэллоуин, финал ЛЧ, персонаж); не подставляй примеры, нет темы — не заполняй" },
    {
      key: "brand",
      label: "Бренд",
      hint:
        "название КАЗИНО / букмекера — оператора, чей сайт рекламируем. НЕ название игры или слота: Plinko, Aviator, Mines, " +
        "Crash, Sweet Bonanza, Gates of Olympus — это игры, их в brand не ставь. Если в ТЗ «название казино» совпадает с " +
        "названием игры, бренд — по домену сайта (olymp-csn.com → Olymp)",
    },
    {
      key: "game",
      label: "Игра",
      hint:
        "игра/механика, которую ТЗ просит сделать (лендинг-игра или плейбл): plinko — шарик падает на множители; wheel — колесо " +
        "фортуны; slot — слот-барабаны; aviator — самолёт/краш-множитель; mines — мины и алмазы; scratch — скретч-карта; " +
        "chests — сундуки; safe — сейф; cases — кейсы; roulette — рулетка; penalty — пенальти; basket — баскетбол; darts; dice; " +
        "claw — автомат-хваталка; memory; catcher; cut; blast; match3; quiz. Только если ТЗ явно описывает игру",
      enum: ["safe","wheel","scratch","slot","chests","aviator","plinko","memory","catcher","basket","penalty","roulette","mines","cases","claw","darts","dice","cut","blast","match3","quiz"],
    },
    { key: "site", label: "Сайт бренда", hint: "адрес сайта или домен бренда, если указан" },
    { key: "kind", label: "Тип трафика", hint: "казино или ставки на спорт", enum: ["casino", "sport"] },
    { key: "lang", label: "Язык", hint: "язык креативов — ISO-код из двух букв: ru, uk, en, es, de, pl, pt, fr, it, tr, kk, az, uz… («RU, rus» → ru)" },
    { key: "offer", label: "Оффер", hint: "главный оффер: «+200% к депозиту и 500 FS», «фрибет 100 €». Сокращения ТЗ раскрывай, как прочтёт игрок: fs/фс — фриспины, rub/руб — ₽, uah/грн — ₴, eur — €; 50.000 → 50 000; «222fs+50.000rub» → «222 фриспина + 50 000 ₽»" },
    { key: "headline", label: "Заголовок", hint: "заголовок первого экрана, если задан в ТЗ" },
    { key: "cta", label: "Кнопка", hint: "текст кнопки, ≤24 символов" },
    { key: "link", label: "Ссылка", hint: "ссылка по кнопкам: оффер или трекер (http…)" },
    { key: "amount", label: "Выигрыш", hint: "число выигрыша в игре, только цифры: 500, 100" },
    { key: "unit", label: "Единица", hint: "единица выигрыша: FS, €, $, ₸" },
    { key: "parts", label: "Что делать", hint: "какие части нужны, через запятую из: landing (лендинг), playable (плейбл, «имитация игры»), email (письмо), banner (баннер) — только если ТЗ это явно перечисляет" },
  ],
};
