// Template field definitions + the Preset shape, shared by the gallery
// (PresetSidebar.tsx) and the preset data modules. Kept out of the component
// so data files can import them without a runtime import cycle.

export type TemplateField =
  | {
      id: string;
      type: "select";
      label: string;
      options: { value: string; label: string; prompt?: string }[];
      default?: string;
    }
  | { id: string; type: "checkbox"; label: string; prompt: string; default?: boolean };

export type Preset = {
  id: string;
  name: string;
  description: string;
  gradient: string;
  preview?: string;
  examples: string[];
  template?: string;
  /** Shows a lime "Новое" badge on the tile and floats the preset to the top
   *  under the "Сначала новые" sort. */
  isNew?: boolean;
  /** Optional custom fields (dropdowns / checkboxes) shown for this template. */
  fields?: TemplateField[];
};

export const FIELD_SHOW_ODDS: TemplateField = {
  id: "showOdds",
  type: "checkbox",
  label: "Показать коэффициент",
  prompt: "Include a prominent sample betting odds accent.",
};
export const FIELD_BONUS_BADGE: TemplateField = {
  id: "bonusBadge",
  type: "checkbox",
  label: "Бейдж-оффер",
  prompt: "Add a bold bonus/offer badge inside the central safe zone.",
};
export const FIELD_SPORT: TemplateField = {
  id: "sport",
  type: "select",
  label: "Вид спорта",
  default: "football",
  options: [
    { value: "football", label: "Футбол", prompt: "Sport context: football (soccer)." },
    { value: "basketball", label: "Баскетбол", prompt: "Sport context: basketball." },
    { value: "tennis", label: "Теннис", prompt: "Sport context: tennis." },
    { value: "esports", label: "Киберспорт", prompt: "Sport context: esports." },
  ],
};
export const FIELD_MATCH_MOMENT: TemplateField = {
  id: "moment",
  type: "select",
  label: "Момент",
  default: "action",
  options: [
    { value: "action", label: "Экшн", prompt: "Capture a dynamic mid-action moment." },
    { value: "start", label: "Старт", prompt: "Depict the start / kickoff moment." },
    { value: "win", label: "Победный момент", prompt: "Depict a triumphant victory moment." },
  ],
};
export const FIELD_TIME_OF_DAY: TemplateField = {
  id: "timeOfDay",
  type: "select",
  label: "Время суток",
  default: "auto",
  options: [
    { value: "auto", label: "Авто" },
    { value: "day", label: "День", prompt: "Daytime setting." },
    { value: "night", label: "Ночь (софиты)", prompt: "Night setting under bright floodlights." },
    { value: "dusk", label: "Закат", prompt: "Dusk / golden-hour setting." },
  ],
};
export const FIELD_CASINO_PROP: TemplateField = {
  id: "prop",
  type: "select",
  label: "Реквизит",
  default: "auto",
  options: [
    { value: "auto", label: "Авто" },
    { value: "coins", label: "Монеты", prompt: "Feature flying gold coins." },
    { value: "chips", label: "Фишки", prompt: "Feature casino chips." },
    { value: "cards", label: "Карты", prompt: "Feature playing cards." },
    { value: "diamonds", label: "Бриллианты", prompt: "Feature sparkling diamonds and gems." },
  ],
};
export const FIELD_WIN_CALLOUT: TemplateField = {
  id: "callout",
  type: "select",
  label: "Плашка выигрыша",
  default: "auto",
  options: [
    { value: "auto", label: "Авто" },
    { value: "win", label: "WIN!", prompt: "Include a bold WIN! callout." },
    { value: "big", label: "BIG WIN", prompt: "Include a BIG WIN callout." },
    { value: "jackpot", label: "JACKPOT", prompt: "Include a JACKPOT callout." },
    { value: "mega", label: "MEGA WIN", prompt: "Include a MEGA WIN callout." },
  ],
};
export const FIELD_JACKPOT_TIER: TemplateField = {
  id: "jackpotTier",
  type: "select",
  label: "Тир джекпота",
  default: "mega",
  options: [
    { value: "mega", label: "Mega", prompt: "Headline a Mega jackpot tier." },
    { value: "grand", label: "Grand", prompt: "Headline a Grand jackpot tier." },
    { value: "daily", label: "Daily", prompt: "Headline a Daily jackpot tier." },
  ],
};
export const FIELD_ODDS_MULT: TemplateField = {
  id: "oddsMult",
  type: "select",
  label: "Множитель",
  default: "x50",
  options: [
    { value: "x10", label: "×10", prompt: "Headline a ×10 odds multiplier." },
    { value: "x25", label: "×25", prompt: "Headline a ×25 odds multiplier." },
    { value: "x50", label: "×50", prompt: "Headline a ×50 odds multiplier." },
    { value: "x100", label: "×100", prompt: "Headline a ×100 odds multiplier." },
  ],
};
