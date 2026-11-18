// Что движок ТЗ должен решить для конкретного инструмента.
//
// Общая часть задания (оффер, язык, бренд, стиль, референсы, требования,
// допущения) одинакова для всех. Сверх неё у каждого инструмента — свой «план»:
// для лендинга это механика и блоки, для письма — шаблон и тексты, для GIF —
// баннер и анимация… План описывается здесь, модель возвращает его в job.plan,
// а нормализует сервер функцией normalize.
//
// Серверный модуль (импортируется /api/tz/understand).

export type TzProduct = "banner" | "bannerLayers" | "gif" | "landing" | "playable" | "email" | "campaign";

export const TZ_PRODUCTS: TzProduct[] = ["banner", "bannerLayers", "gif", "landing", "playable", "email", "campaign"];

export type TzPlanSpec = {
  /** Что делает инструмент — по-английски, для модели. */
  tool: string;
  /** Нужна ли баннерная часть задания (banners, sizes, шаблон из каталога). */
  banners: boolean;
  /** Что решить в plan — по-английски. Пусто — plan не нужен. */
  planInstructions: string;
  /** Форма JSON плана, например «{mechanic:string, blocks:string[]}». */
  planShape: string;
  /** Привести ответ модели к безопасной форме (обрезать строки, проверить enum). */
  normalize?: (raw: Record<string, unknown>) => Record<string, unknown>;
};
