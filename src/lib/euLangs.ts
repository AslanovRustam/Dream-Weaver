// Европейские языки для кампании. У четырёх (ru, uk, en, es) — готовые тексты
// во всех частях; остальные получают перевод английского набора текстов
// (см. campaignI18n.ts) — один раз на язык и набор, с кэшем в браузере.

import type { LandingLang } from "./landingKit";

export type EuLang = {
  id: string;
  /** Самоназвание — так язык ищут в списке. */
  label: string;
  /** Английское название — для промпта переводчика. */
  english: string;
  /** Локаль для чисел и сумм в плейбле. */
  locale: string;
};

export const EU_LANGS: EuLang[] = [
  { id: "en", label: "English", english: "English", locale: "en-GB" },
  { id: "ru", label: "Русский", english: "Russian", locale: "ru-RU" },
  { id: "uk", label: "Українська", english: "Ukrainian", locale: "uk-UA" },
  { id: "es", label: "Español", english: "Spanish", locale: "es-ES" },
  { id: "de", label: "Deutsch", english: "German", locale: "de-DE" },
  { id: "fr", label: "Français", english: "French", locale: "fr-FR" },
  { id: "it", label: "Italiano", english: "Italian", locale: "it-IT" },
  { id: "pt", label: "Português", english: "Portuguese (European)", locale: "pt-PT" },
  { id: "nl", label: "Nederlands", english: "Dutch", locale: "nl-NL" },
  { id: "pl", label: "Polski", english: "Polish", locale: "pl-PL" },
  { id: "cs", label: "Čeština", english: "Czech", locale: "cs-CZ" },
  { id: "sk", label: "Slovenčina", english: "Slovak", locale: "sk-SK" },
  { id: "sl", label: "Slovenščina", english: "Slovenian", locale: "sl-SI" },
  { id: "hr", label: "Hrvatski", english: "Croatian", locale: "hr-HR" },
  { id: "sr", label: "Srpski", english: "Serbian (Latin script)", locale: "sr-Latn-RS" },
  { id: "bs", label: "Bosanski", english: "Bosnian", locale: "bs-BA" },
  { id: "mk", label: "Македонски", english: "Macedonian", locale: "mk-MK" },
  { id: "bg", label: "Български", english: "Bulgarian", locale: "bg-BG" },
  { id: "ro", label: "Română", english: "Romanian", locale: "ro-RO" },
  { id: "hu", label: "Magyar", english: "Hungarian", locale: "hu-HU" },
  { id: "el", label: "Ελληνικά", english: "Greek", locale: "el-GR" },
  { id: "sq", label: "Shqip", english: "Albanian", locale: "sq-AL" },
  { id: "tr", label: "Türkçe", english: "Turkish", locale: "tr-TR" },
  { id: "da", label: "Dansk", english: "Danish", locale: "da-DK" },
  { id: "sv", label: "Svenska", english: "Swedish", locale: "sv-SE" },
  { id: "no", label: "Norsk", english: "Norwegian (Bokmål)", locale: "nb-NO" },
  { id: "fi", label: "Suomi", english: "Finnish", locale: "fi-FI" },
  { id: "is", label: "Íslenska", english: "Icelandic", locale: "is-IS" },
  { id: "et", label: "Eesti", english: "Estonian", locale: "et-EE" },
  { id: "lv", label: "Latviešu", english: "Latvian", locale: "lv-LV" },
  { id: "lt", label: "Lietuvių", english: "Lithuanian", locale: "lt-LT" },
  { id: "be", label: "Беларуская", english: "Belarusian", locale: "be-BY" },
  { id: "ka", label: "ქართული", english: "Georgian", locale: "ka-GE" },
  { id: "hy", label: "Հայերեն", english: "Armenian", locale: "hy-AM" },
  { id: "az", label: "Azərbaycan", english: "Azerbaijani", locale: "az-AZ" },
  { id: "kk", label: "Қазақша", english: "Kazakh", locale: "kk-KZ" },
  { id: "ca", label: "Català", english: "Catalan", locale: "ca-ES" },
  { id: "eu", label: "Euskara", english: "Basque", locale: "eu-ES" },
  { id: "gl", label: "Galego", english: "Galician", locale: "gl-ES" },
  { id: "ga", label: "Gaeilge", english: "Irish", locale: "ga-IE" },
  { id: "mt", label: "Malti", english: "Maltese", locale: "mt-MT" },
  { id: "lb", label: "Lëtzebuergesch", english: "Luxembourgish", locale: "lb-LU" },
];

const BUILT_IN: LandingLang[] = ["ru", "uk", "en", "es"];

export const euLang = (id: string): EuLang => EU_LANGS.find((l) => l.id === id) ?? EU_LANGS[0];
/** Есть ли у языка готовые тексты во всех частях. */
export const isBuiltInLang = (id: string): id is LandingLang => (BUILT_IN as string[]).includes(id);
/** На каком из готовых наборов собирать: свой — если есть, иначе английский (его и переводим). */
export const baseLang = (id: string): LandingLang => (isBuiltInLang(id) ? id : "en");
