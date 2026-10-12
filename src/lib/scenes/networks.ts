/**
 * Куда выгружается плейбл. Пользователь выбирает одну или несколько площадок
 * и получает по файлу на каждую: от площадки зависят кнопка (как она уводит),
 * что подключается в <head>, формат файла и лимит веса.
 *
 * MRAID (AppLovin, Unity, Liftoff): один HTML ≤ 5 МБ, контейнер сам
 *   подкладывает mraid.js, кнопка — mraid.open(ссылка), старт по ready.
 * Google Ads: ZIP с index.html ≤ 5 МБ, <meta name="ad.size">,
 *   <meta name="ad.orientation">, ExitApi; ссылка — в настройках объявления.
 * Meta (Facebook, Instagram, Audience Network): один HTML ≤ 2 МБ (или ZIP
 *   ≤ 5 МБ, где index.html ≤ 2 МБ и не больше 100 файлов), без mraid.js,
 *   без внешних запросов и JS-редиректов; кнопка — FbPlayableAd.onCTAClick(),
 *   стор Meta берёт из кампании.
 * Сайт: ZIP с index.html и инструкцией по встраиванию (iframe); кнопка
 *   открывает ссылку в новой вкладке. Лимита сети нет.
 */
export type PlayableNetwork = "mraid" | "google" | "meta" | "web";

export type NetworkSpec = {
  id: PlayableNetwork;
  label: string;
  hint: string;
  /** Лимит выгрузки в байтах (для Meta — у одного HTML). */
  limit: number;
  /** Ссылку по кнопке берёт из файла (а не из кабинета площадки). */
  needsUrl: boolean;
  /** Коротко — что проверит площадка. */
  rules: string;
};

const MB = 1024 * 1024;

export const PLAYABLE_NETWORKS: NetworkSpec[] = [
  {
    id: "mraid",
    label: "MRAID-сети",
    hint: "AppLovin, Unity, Liftoff · один HTML",
    limit: 5 * MB,
    needsUrl: true,
    rules: "MRAID 2.0+, один HTML до 5 МБ, без внешних запросов; кнопка — mraid.open.",
  },
  {
    id: "google",
    label: "Google Ads",
    hint: "HTML5-объявление · ZIP",
    limit: 5 * MB,
    needsUrl: false,
    rules: "ZIP с index.html до 5 МБ, мета-теги размера и ориентации, ExitApi; ссылка — в объявлении.",
  },
  {
    id: "meta",
    label: "Meta",
    hint: "Facebook, Instagram, Audience Network",
    limit: 2 * MB,
    needsUrl: false,
    rules: "Один HTML до 2 МБ (тяжелее — ZIP до 5 МБ), без mraid.js и внешних запросов; кнопка — FbPlayableAd.onCTAClick(), стор — из кампании.",
  },
  {
    id: "web",
    label: "Сайт",
    hint: "Свой сайт или лендинг · ZIP + код iframe",
    limit: Infinity,
    needsUrl: true,
    rules: "ZIP с index.html и кодом для вставки; кнопка открывает ссылку в новой вкладке.",
  },
];

export const NETWORK_BY_ID = new Map(PLAYABLE_NETWORKS.map((n) => [n.id, n]));
/** Лимит ZIP у Meta, если HTML не влез в 2 МБ. */
export const META_ZIP_LIMIT = 5 * MB;
