/**
 * Куда выгружается плейбл. От сети зависят три вещи: как кнопка уводит
 * пользователя, что подключается в <head> и в каком виде отдаётся файл.
 *
 * MRAID — общий стандарт in-app сетей (AppLovin, Unity, ironSource,
 * Mintegral, Liftoff): контейнер сам подкладывает mraid.js, кнопка зовёт
 * mraid.open(ссылка), файл — один HTML без внешних запросов.
 *
 * Google Ads — HTML5-объявление: ZIP с index.html, мета-тег размера и ExitApi.
 * Ссылку перехода Google берёт из настроек объявления, в файл её не пишем.
 */
export type PlayableNetwork = "mraid" | "google";

export const PLAYABLE_NETWORKS: {
  id: PlayableNetwork;
  label: string;
  hint: string;
  /** Лимит выгрузки в байтах. */
  limit: number;
}[] = [
  {
    id: "mraid",
    label: "MRAID-сети",
    hint: "AppLovin, Unity, ironSource, Mintegral, Liftoff · один HTML",
    limit: 5 * 1024 * 1024,
  },
  {
    id: "google",
    label: "Google Ads",
    hint: "HTML5-объявление · ZIP с index.html",
    limit: 5 * 1024 * 1024,
  },
];
