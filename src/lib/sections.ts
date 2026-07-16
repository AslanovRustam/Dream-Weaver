// The four product sections of the platform. Single source of truth used by
// the Hub start screen, the header section-switcher, and each section's route.
// All four have working UI now (banner / landing / playable / video); the AI
// backends behind them are still mocked to varying degrees.
import { Image, LayoutTemplate, Gamepad2, Film, type LucideIcon } from "lucide-react";

export type SectionId = "banner" | "landing" | "playable" | "video";

export type Section = {
  id: SectionId;
  route: string;
  title: string;
  /** One-line description shown on the Hub card. */
  description: string;
  /** Primary CTA label ("Создать …"). */
  cta: string;
  icon: LucideIcon;
  /** Placeholder copy for the scaffold settings column (sections 2–4). */
  scaffoldHint: string;
  /** False while the section is only a scaffold (no real generation yet). */
  ready: boolean;
};

export const SECTIONS: Section[] = [
  {
    id: "banner",
    route: "/banner",
    title: "Баннер-генератор",
    description: "Статичные баннеры для соцсетей, ставок и рекламы",
    cta: "Создать баннер",
    icon: Image,
    scaffoldHint: "",
    ready: true,
  },
  {
    id: "landing",
    route: "/landing",
    title: "Лендинг-генератор",
    description: "Лендинги на основе баннера или с нуля",
    cta: "Создать лендинг",
    icon: LayoutTemplate,
    scaffoldHint:
      "Здесь появятся настройки для генерации лендинга: структура блоков, тексты, изображения",
    ready: true,
  },
  {
    id: "playable",
    route: "/playable",
    title: "Плейбл-реклама",
    description: "Интерактивные игровые баннеры",
    cta: "Создать плейбл",
    icon: Gamepad2,
    scaffoldHint: "Здесь появятся настройки интерактивной механики и сценария",
    ready: true,
  },
  {
    id: "video",
    route: "/video",
    title: "Конструктор видео",
    description: "Скринкасты, персонажи, липсинк, музыка",
    cta: "Создать видео",
    icon: Film,
    scaffoldHint:
      "Здесь появятся настройки скринкаста, персонажа, липсинка, музыки и доп. элементов",
    ready: true,
  },
];

export const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

/** Resolve the current section from a pathname (null on Hub / non-tool pages). */
export function sectionFromPath(pathname: string | null): Section | null {
  if (!pathname) return null;
  return SECTIONS.find((s) => pathname === s.route || pathname.startsWith(s.route + "/")) ?? null;
}
