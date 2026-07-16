// Video-constructor model + client-side mock "generation".
//
// Mirrors the shape of the other generators (banner / landing / playable) so a
// real AI video backend can be slotted in later. For now everything is a
// self-contained mock: avatar/voice/music libraries are placeholder data, and
// "generation" is a simulated staged pipeline (script → voice → lipsync →
// render) driven purely on the client so the whole UX (progress, ETA, player,
// multi-language versions) can be approved before a real engine exists.

// ---- Scene types (left column) ---------------------------------------------

export type VideoSceneType = "screencast" | "talkinghead" | "overlay" | "voiceover";

export const VIDEO_SCENE_TYPES: {
  id: VideoSceneType;
  label: string;
  description: string;
  /** Whether the "Персонаж/аватар" section is relevant for this scene. */
  needsAvatar: boolean;
  /** Whether the "Сцена/фон" section asks for a screen recording upload. */
  needsScreencast: boolean;
}[] = [
  {
    id: "screencast",
    label: "Скринкаст с озвучкой",
    description: "Запись/загрузка экрана + голос поверх",
    needsAvatar: false,
    needsScreencast: true,
  },
  {
    id: "talkinghead",
    label: "Говорящий персонаж",
    description: "AI-аватар говорит на камеру",
    needsAvatar: true,
    needsScreencast: false,
  },
  {
    id: "overlay",
    label: "Персонаж поверх контента",
    description: "Аватар в углу поверх демо/скринкаста",
    needsAvatar: true,
    needsScreencast: true,
  },
  {
    id: "voiceover",
    label: "Только голос + визуал",
    description: "Закадровый голос поверх сцены / B-roll",
    needsAvatar: false,
    needsScreencast: false,
  },
];

export const VIDEO_SCENE_BY_ID = new Map(VIDEO_SCENE_TYPES.map((s) => [s.id, s]));

// ---- Avatar library (mock) --------------------------------------------------

export type AvatarStyle = "casual" | "professional" | "genz";

export const VIDEO_AVATAR_STYLES: { id: AvatarStyle | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "casual", label: "Casual" },
  { id: "professional", label: "Professional" },
  { id: "genz", label: "Gen Z" },
];

export type VideoAvatar = { id: string; name: string; style: AvatarStyle; img: string };

// Placeholder faces (pravatar) — swapped for a real avatar library on integration.
const avatarImg = (n: number) => `https://i.pravatar.cc/240?img=${n}`;

export const VIDEO_AVATARS: VideoAvatar[] = [
  { id: "a1", name: "Алекс", style: "casual", img: avatarImg(12) },
  { id: "a2", name: "Марина", style: "professional", img: avatarImg(45) },
  { id: "a3", name: "Джей", style: "genz", img: avatarImg(15) },
  { id: "a4", name: "София", style: "casual", img: avatarImg(47) },
  { id: "a5", name: "Виктор", style: "professional", img: avatarImg(33) },
  { id: "a6", name: "Кира", style: "genz", img: avatarImg(49) },
  { id: "a7", name: "Даниэль", style: "professional", img: avatarImg(52) },
  { id: "a8", name: "Лея", style: "casual", img: avatarImg(44) },
  { id: "a9", name: "Макс", style: "genz", img: avatarImg(53) },
  { id: "a10", name: "Нина", style: "professional", img: avatarImg(31) },
  { id: "a11", name: "Том", style: "casual", img: avatarImg(59) },
  { id: "a12", name: "Ева", style: "genz", img: avatarImg(24) },
];

// ---- Voice library (mock) ---------------------------------------------------

export type VideoVoice = {
  id: string;
  name: string;
  gender: "male" | "female";
  tone: "casual" | "professional";
  /** Short blurb shown as the "sample" (real audio comes with integration). */
  sample: string;
};

export const VIDEO_VOICES: VideoVoice[] = [
  { id: "v1", name: "Артём", gender: "male", tone: "casual", sample: "Дружелюбный, разговорный" },
  { id: "v2", name: "Ольга", gender: "female", tone: "professional", sample: "Уверенный, дикторский" },
  { id: "v3", name: "Игорь", gender: "male", tone: "professional", sample: "Глубокий, солидный" },
  { id: "v4", name: "Дарья", gender: "female", tone: "casual", sample: "Лёгкий, энергичный" },
  { id: "v5", name: "Лев", gender: "male", tone: "casual", sample: "Молодой, живой" },
  { id: "v6", name: "Инна", gender: "female", tone: "professional", sample: "Тёплый, спокойный" },
];

// ---- Music library (mock) ---------------------------------------------------

export type MusicMood = "energetic" | "calm" | "drive";

export const VIDEO_MOODS: { id: MusicMood; label: string }[] = [
  { id: "energetic", label: "Энергичная" },
  { id: "calm", label: "Спокойная" },
  { id: "drive", label: "Драйвовая" },
];

export type VideoTrack = { id: string; label: string; mood: MusicMood; durationSec: number };

export const VIDEO_MUSIC: VideoTrack[] = [
  { id: "m0", label: "Без музыки", mood: "calm", durationSec: 0 },
  { id: "m1", label: "Neon Rush", mood: "energetic", durationSec: 28 },
  { id: "m2", label: "Soft Focus", mood: "calm", durationSec: 32 },
  { id: "m3", label: "Big Win", mood: "drive", durationSec: 24 },
  { id: "m4", label: "City Lights", mood: "energetic", durationSec: 30 },
  { id: "m5", label: "Slow Motion", mood: "calm", durationSec: 34 },
];

// ---- Backgrounds (presets for Talking Head / voiceover) ---------------------

export type VideoBackground = { id: string; label: string; css: string; dark: boolean };

export const VIDEO_BACKGROUNDS: VideoBackground[] = [
  { id: "studio", label: "Студия", css: "radial-gradient(circle at 50% 30%,#1f2937,#0b0f17)", dark: true },
  { id: "neon", label: "Неон", css: "linear-gradient(135deg,#3b0764,#1e1b4b,#0f172a)", dark: true },
  { id: "lime", label: "Лайм", css: "linear-gradient(135deg,#1a2e05,#3f6212,#0b0f17)", dark: true },
  { id: "sunset", label: "Закат", css: "linear-gradient(135deg,#7c2d12,#b45309,#0b0f17)", dark: true },
  { id: "ocean", label: "Океан", css: "linear-gradient(135deg,#0c4a6e,#0e7490,#0b0f17)", dark: true },
  { id: "plain", label: "Однотонный", css: "#111827", dark: true },
];

export const VIDEO_RATIOS: { id: string; label: string }[] = [
  { id: "9:16", label: "Портрет 9:16" },
  { id: "16:9", label: "Ландшафт 16:9" },
  { id: "1:1", label: "Квадрат 1:1" },
];

// ---- Simulated generation pipeline -----------------------------------------

export const VIDEO_STAGES: { id: string; label: string; weight: number }[] = [
  { id: "script", label: "Обработка сценария", weight: 1 },
  { id: "voice", label: "Синтез голоса", weight: 2 },
  { id: "lipsync", label: "Липсинк", weight: 3 },
  { id: "render", label: "Рендер видео", weight: 4 },
];

/** Total simulated wall-clock of a mock generation, in ms. */
export const VIDEO_TOTAL_MS = 7200;

const STAGE_TOTAL_WEIGHT = VIDEO_STAGES.reduce((a, s) => a + s.weight, 0);

/** Map an overall 0..1 progress to the active stage index (by cumulative weight). */
export function stageIndexForProgress(p: number): number {
  const target = Math.min(1, Math.max(0, p)) * STAGE_TOTAL_WEIGHT;
  let acc = 0;
  for (let i = 0; i < VIDEO_STAGES.length; i++) {
    acc += VIDEO_STAGES[i].weight;
    if (target <= acc) return i;
  }
  return VIDEO_STAGES.length - 1;
}

// ---- Script auto-generation (mock, client-side) ----------------------------

/** Cheap templated "AI" script — replaced by a real POST /api/video/script. */
export function generateVideoScript(topic: string, brand: string, lang: string): string {
  const t = topic.trim() || (lang === "en" ? "your offer" : "ваш оффер");
  const b = brand.trim() || (lang === "en" ? "our brand" : "нашего бренда");
  if (lang === "en") {
    return [
      `Tired of the same old ${t}? Meet ${b}.`,
      `In just a few taps you get a bonus, fast payouts and a game that actually rewards you.`,
      `Thousands already play — and today it's your turn.`,
      `Tap the link and claim your welcome bonus now!`,
    ].join(" ");
  }
  if (lang === "uk") {
    return [
      `Втомились від звичного ${t}? Знайомтесь — ${b}.`,
      `Лише кілька кроків: бонус, швидкі виплати та гра, що справді винагороджує.`,
      `Тисячі вже грають — сьогодні ваша черга.`,
      `Тисніть на посилання та забирайте вітальний бонус!`,
    ].join(" ");
  }
  return [
    `Устали от обычного ${t}? Знакомьтесь — ${b}.`,
    `Всего пара шагов: бонус, быстрые выплаты и игра, которая действительно вознаграждает.`,
    `Тысячи уже играют — сегодня ваша очередь.`,
    `Переходите по ссылке и забирайте приветственный бонус прямо сейчас!`,
  ].join(" ");
}

// ---- Input / result shapes --------------------------------------------------

export type VideoInput = {
  sceneType: VideoSceneType;
  script: string;
  topic: string;
  avatarId: string;
  customAvatar: string;
  voiceId: string;
  backgroundId: string;
  customBackground: string;
  screencast: string;
  musicId: string;
  subtitles: boolean;
  watermark: boolean;
  textOverlay: string;
  brandName: string;
  brandLogo: string;
  language: string;
  extraLangs: string[];
  ratio: string;
};

export type VideoResult = {
  durationSec: number;
  createdAt: number;
};

/** Rough duration estimate from the script length (≈2.6 words/sec speech). */
export function estimateDurationSec(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(6, Math.min(60, Math.round(words / 2.6)));
}
