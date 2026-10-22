// Пресеты сценарных плейблов: какие тексты есть у сцены, тексты по умолчанию
// на четырёх языках и темы для ИИ-оформления.

import type { SceneId } from "./build";

export type SceneLang = "ru" | "uk" | "en" | "es";

export const SCENE_LANGS: { id: SceneLang; label: string; locale: string }[] = [
  { id: "ru", label: "Русский", locale: "ru-RU" },
  { id: "uk", label: "Українська", locale: "uk-UA" },
  { id: "en", label: "English", locale: "en-US" },
  { id: "es", label: "Español", locale: "es-MX" },
];

export type SceneTextField = {
  key: string;
  label: string;
  /** Многострочное поле: перевод строки попадёт в плейбл как <br>. */
  multiline?: boolean;
};

export type SceneMeta = {
  id: SceneId;
  label: string;
  description: string;
  fields: SceneTextField[];
  /** Тема фона для ИИ по умолчанию. */
  bgTheme: string;
  /** Что рисует ИИ для попапа (прозрачный фон). */
  rewardTheme: string;
};

const POPUP_FIELDS: SceneTextField[] = [
  { key: "bonus", label: "Над суммой в попапе" },
  { key: "cta", label: "Кнопка в попапе" },
];

export const SCENES: SceneMeta[] = [
  {
    id: "safe",
    label: "Сейф",
    description: "Три нажатия: первое срывается, третье вскрывает дверь — внутри золото.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв нажать" },
      { key: "tryAgain", label: "После неудачи" },
      { key: "tapsLeft", label: "Счётчик нажатий (перед числом)" },
      { key: "open", label: "Когда сейф открыт" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Luxurious bank vault interior, warm golden light, polished steel and brass, bokeh sparkles",
    rewardTheme: "A heap of shiny gold bars and gold coins, casino jackpot treasure, 3D render",
  },
  {
    id: "wheel",
    label: "Колесо",
    description: "Первое вращение — в шаге от джекпота, второе останавливается на нём.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв крутить" },
      { key: "tryAgain", label: "После промаха" },
      { key: "spinsLeft", label: "Счётчик вращений (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Glamorous casino hall at night, golden lights, red velvet, soft bokeh, festive confetti",
    rewardTheme: "A golden treasure chest overflowing with gold coins and gems, casino jackpot, 3D render",
  },
  {
    id: "scratch",
    label: "Скретч-карта",
    description: "Палец стирает фольгу — под ней три монеты. Открывается сама, когда стёрта половина.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Подсказка над картой" },
      { key: "won", label: "Когда три совпали" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Lucky casino lottery scene, purple and gold neon glow, flying gold coins, sparkles, bokeh",
    rewardTheme: "A stack of gold coins with a shiny lucky clover, casino win, 3D render",
  },
  {
    id: "slot",
    label: "Слот",
    description: "Рычаг, три барабана: первый спин — две семёрки и третья застревает, второй — 7·7·7.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв крутить" },
      { key: "tryAgain", label: "После промаха" },
      { key: "spinsLeft", label: "Счётчик спинов (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Vegas casino floor at night, rows of glowing slot machines in soft bokeh, neon and gold lights",
    rewardTheme: "A big golden jackpot pile of coins with a glowing lucky seven, casino win, 3D render",
  },
  {
    id: "chests",
    label: "Сундуки",
    description: "Выбери один из трёх: первый пустой — он закрывается, сундуки перемешиваются, как напёрстки, и со второй попытки — золото и луч света.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв выбрать" },
      { key: "empty", label: "Надпись над пустым сундуком" },
      { key: "shuffle", label: "Пока сундуки перемешиваются" },
      { key: "tryAgain", label: "После перемешивания" },
      { key: "triesLeft", label: "Счётчик попыток (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Pirate treasure cave with glowing gold, warm torchlight, sparkling gems, magical dust, bokeh",
    rewardTheme: "An open pirate treasure chest overflowing with gold coins and jewels, 3D render",
  },
  {
    id: "aviator",
    label: "Авиатор",
    description: "Самолёт взлетает, множитель растёт — жми «Забрать», пока летит.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв взлететь" },
      { key: "cashout", label: "Кнопка в полёте (перед множителем)" },
      { key: "cashoutHint", label: "Подсказка в полёте" },
      { key: "won", label: "Кнопка после выигрыша (перед множителем)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Night sky above clouds with glowing red and pink neon haze, city lights far below, stars, bokeh",
    rewardTheme: "A shiny red propeller airplane flying over a pile of gold coins, casino win, 3D render",
  },
  {
    id: "plinko",
    label: "Плинко",
    description: "Шарик скачет по штырькам: первый садится в ×0.5, второй — в ×100.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв бросить" },
      { key: "tryAgain", label: "После первого шарика" },
      { key: "ballsLeft", label: "Счётчик шариков (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Cosmic purple arcade with neon pink and violet glow, floating sparkles, soft bokeh",
    rewardTheme: "A glowing pink plinko ball on top of a pile of gold coins, casino win, 3D render",
  },
  {
    id: "memory",
    label: "Мемори",
    description: "Карты на миг открываются — запомни и найди четыре пары символов.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "memo", label: "Пока карты открыты" },
      { key: "tap", label: "Призыв искать пары" },
      { key: "pairs", label: "Счётчик пар (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Elegant casino card table with purple velvet and gold trim, soft spotlight, sparkles, bokeh",
    rewardTheme: "A fan of golden playing cards over a pile of gold coins, casino win, 3D render",
  },
  {
    id: "catcher",
    label: "Ловец",
    description: "Веди котёл пальцем: лови монеты, уворачивайся от бомб — десять монет и бонус твой.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв начать" },
      { key: "go", label: "Во время игры" },
      { key: "caught", label: "Счётчик монет (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Magical golden coin rain over a fairy-tale casino landscape at dusk, sparkles, bokeh",
    rewardTheme: "A pot of gold overflowing with shiny coins, lucky casino win, 3D render",
  },
  {
    id: "basket",
    label: "Баскетбол",
    description: "Свайп вверх — бросок: первый звенит о дужку, второй чисто в сетку. Для беттинга.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв бросить" },
      { key: "tryAgain", label: "После промаха" },
      { key: "shotsLeft", label: "Счётчик бросков (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Night basketball arena with bright floodlights, glowing parquet court, cheering crowd blurred in bokeh",
    rewardTheme: "A golden basketball trophy on a pile of gold coins, sports betting win, 3D render",
  },
  {
    id: "penalty",
    label: "Пенальти",
    description: "Свайп к воротам — удар: первый берёт вратарь, второй — в девятку. Для беттинга.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв ударить" },
      { key: "tryAgain", label: "После сейва" },
      { key: "kicksLeft", label: "Счётчик ударов (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Football stadium at night from the penalty spot, blazing floodlights, green pitch, crowd in bokeh, light haze",
    rewardTheme: "A golden football trophy on a pile of gold coins, sports betting win, 3D render",
  },
  {
    id: "roulette",
    label: "Рулетка",
    description: "Ставка на красное: первый шарик — в зеро, второй — в красную семёрку.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв крутить" },
      { key: "tryAgain", label: "После зеро" },
      { key: "spinsLeft", label: "Счётчик запусков (перед числом)" },
      { key: "bet", label: "Фишка ставки" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Luxurious casino roulette table under warm spotlights, green felt, stacks of chips, gold accents, bokeh",
    rewardTheme: "Tall stacks of casino chips and gold coins with a glowing roulette ball, casino win, 3D render",
  },
  {
    id: "mines",
    label: "Мины",
    description: "Открывай клетки — алмазы растят множитель. Первый раунд — бомба, второй — ×10.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв открыть" },
      { key: "tryAgain", label: "После бомбы" },
      { key: "mult", label: "Множитель (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Dark futuristic crypto casino interior, deep blue neon light, floating glowing gems, bokeh",
    rewardTheme: "A pile of glowing blue diamonds and gold coins, crypto casino win, 3D render",
  },
  {
    id: "cases",
    label: "Кейс",
    description: "Открытие кейса: лента тормозит под маркером — сначала рядом с легендаркой, потом на ней.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв открыть" },
      { key: "tryAgain", label: "После «почти»" },
      { key: "opensLeft", label: "Счётчик кейсов (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Dark purple gaming arena with neon violet light, floating loot crates, golden sparks, bokeh",
    rewardTheme: "A legendary golden loot item glowing above an open purple crate, gaming casino win, 3D render",
  },
  {
    id: "claw",
    label: "Кран-машина",
    description: "Клешня ездит по рельсу, тап — хватает приз: первый выскальзывает, второй падает в лоток.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв хватать" },
      { key: "tryAgain", label: "Когда приз выскользнул" },
      { key: "triesLeft", label: "Счётчик попыток (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Neon arcade hall at night, glowing pink and purple claw machines, bokeh lights, confetti",
    rewardTheme: "A golden plush prize and gold coins bursting out of a claw machine chute, arcade win, 3D render",
  },
  {
    id: "darts",
    label: "Дартс",
    description: "Мишень с призами вращается: первый дротик — у самого яблочка, второй — в джекпот.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв бросить" },
      { key: "tryAgain", label: "После промаха" },
      { key: "throwsLeft", label: "Счётчик бросков (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Cozy premium pub interior with warm spotlights on a dartboard wall, wood and brass, bokeh",
    rewardTheme: "A golden dart in a glowing bullseye with gold coins flying out, jackpot win, 3D render",
  },
  {
    id: "dice",
    label: "Кости",
    description: "Стакан, два 3D-кубика: сначала 6 и 5, потом дубль шестёрок.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв бросить" },
      { key: "tryAgain", label: "После промаха" },
      { key: "goal", label: "Цель (перед «6 + 6»)" },
      { key: "sum", label: "Сумма (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Luxurious casino craps table under warm spotlights, green felt, scattered chips, gold accents, bokeh",
    rewardTheme: "Two glowing white dice showing double six on a pile of gold coins, casino win, 3D render",
  },
  {
    id: "cut",
    label: "Разрез",
    description: "Монеты и самоцветы подлетают снизу — режь пальцем, бомбы не трогай.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв резать" },
      { key: "go", label: "Во время игры" },
      { key: "cutCount", label: "Счётчик разрезов (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Dark ninja dojo with golden lanterns, flying sparks and gold dust, dramatic light, bokeh",
    rewardTheme: "A golden katana over a pile of gold coins and gems, casino win, 3D render",
  },
  {
    id: "blast",
    label: "Бласт",
    description: "Тапай группы одинаковых самоцветов — они взрываются, сверху сыплются новые.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв начать" },
      { key: "go", label: "Во время игры" },
      { key: "blasted", label: "Счётчик камней (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Glowing crystal cave with purple and blue gems, magical light rays, sparkles, bokeh",
    rewardTheme: "A treasure pile of colorful gems and gold coins, casino win, 3D render",
  },
  {
    id: "match3",
    label: "Три в ряд",
    description: "Меняй соседние самоцветы, собирай ряды от трёх — каскады и бонус.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "tap", label: "Призыв сделать ход" },
      { key: "go", label: "Во время игры" },
      { key: "collected", label: "Счётчик камней (перед числом)" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Enchanted jewel palace with sparkling gems, soft magical glow, pastel purple and gold, bokeh",
    rewardTheme: "A royal crown full of colorful gems on a pile of gold coins, casino win, 3D render",
  },
  {
    id: "quiz",
    label: "Викторина",
    description: "Вопрос и три ответа: верный — конфетти и бонус, неверный — попробуй ещё.",
    fields: [
      { key: "title", label: "Заголовок", multiline: true },
      { key: "question", label: "Вопрос", multiline: true },
      { key: "a1", label: "Верный ответ" },
      { key: "a2", label: "Неверный ответ" },
      { key: "a3", label: "Ещё неверный ответ" },
      { key: "tap", label: "Призыв ответить" },
      { key: "tryAgain", label: "После неверного" },
      ...POPUP_FIELDS,
    ],
    bgTheme: "Bright TV game show studio with golden lights, spotlights and confetti, festive, bokeh",
    rewardTheme: "A golden trophy cup with confetti over a pile of gold coins, quiz win, 3D render",
  },
];

export function sceneMeta(id: SceneId): SceneMeta {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}

type LangPack = { text: Record<string, string>; unit: string; legal: string; prizes?: string[] };

const LEGAL: Record<SceneLang, string> = {
  ru: "18+. Играйте ответственно. Бонус для новых игроков, условия на сайте.",
  uk: "18+. Грайте відповідально. Бонус для нових гравців, умови на сайті.",
  en: "18+. Play responsibly. New players only. T&Cs apply.",
  es: "18+. Juega con responsabilidad. Solo nuevos jugadores. Aplican T&C.",
};

/** Где бонус — не фриспины (фрибет в беттинге). */
const UNIT_BY_SCENE: Partial<Record<SceneId, Record<SceneLang, string>>> = {
  basket: { ru: "€", uk: "€", en: "€", es: "€" },
  penalty: { ru: "€", uk: "€", en: "€", es: "€" },
};

const UNIT: Record<SceneLang, string> = { ru: "фриспинов", uk: "фриспінів", en: "free spins", es: "giros gratis" };

const TEXT: Record<SceneId, Record<SceneLang, Record<string, string>>> = {
  safe: {
    ru: { title: "Открой сейф\nи забери бонус", tap: "Жми, чтобы открыть", tryAgain: "Попробуй ещё раз!", tapsLeft: "Нажатий осталось: ", open: "Открыт!", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Відкрий сейф\nі забери бонус", tap: "Тисни, щоб відкрити", tryAgain: "Спробуй ще раз!", tapsLeft: "Натискань залишилось: ", open: "Відкрито!", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Crack the safe\nand claim your bonus", tap: "Tap to open", tryAgain: "Try again!", tapsLeft: "Taps left: ", open: "Unlocked!", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Abre la caja fuerte\ny llévate el bono", tap: "Toca para abrir", tryAgain: "¡Inténtalo otra vez!", tapsLeft: "Toques restantes: ", open: "¡Abierta!", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  wheel: {
    ru: { title: "Крути колесо\nи выигрывай", tap: "Жми, чтобы крутить", tryAgain: "Почти! Ещё раз", spinsLeft: "Вращений: ", bonus: "Твой выигрыш:", cta: "Забрать выигрыш" },
    uk: { title: "Крути колесо\nі вигравай", tap: "Тисни, щоб крутити", tryAgain: "Майже! Ще раз", spinsLeft: "Обертань: ", bonus: "Твій виграш:", cta: "Забрати виграш" },
    en: { title: "Spin the wheel\nand win", tap: "Tap to spin", tryAgain: "So close! Again", spinsLeft: "Spins: ", bonus: "You won:", cta: "Claim prize" },
    es: { title: "Gira la ruleta\ny gana", tap: "Toca para girar", tryAgain: "¡Casi! Otra vez", spinsLeft: "Giros: ", bonus: "Ganaste:", cta: "Reclamar premio" },
  },
  quiz: {
    ru: { title: "Ответь верно —\nзабери бонус", question: "Какой бонус ждёт новичков?", a1: "500 фриспинов", a2: "Ничего", a3: "Скидка 5%", tap: "Выбери ответ", tryAgain: "Мимо! Попробуй ещё", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Відповідай вірно —\nзабери бонус", question: "Який бонус чекає новачків?", a1: "500 фриспінів", a2: "Нічого", a3: "Знижка 5%", tap: "Обери відповідь", tryAgain: "Мимо! Спробуй ще", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Answer right\nand win", question: "What bonus do new players get?", a1: "500 free spins", a2: "Nothing", a3: "5% off", tap: "Pick an answer", tryAgain: "Wrong! Try again", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Responde bien\ny gana", question: "¿Qué bono reciben los nuevos?", a1: "500 giros gratis", a2: "Nada", a3: "5% de descuento", tap: "Elige una respuesta", tryAgain: "¡No! Inténtalo otra vez", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  match3: {
    ru: { title: "Собери три в ряд —\nзабери бонус", tap: "Свайпни камень", go: "Собирай ряды!", collected: "Камней: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Збери три в ряд —\nзабери бонус", tap: "Свайпни камінь", go: "Збирай ряди!", collected: "Каменів: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Match three\nand win", tap: "Swipe a gem", go: "Make matches!", collected: "Gems: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Junta tres\ny gana", tap: "Desliza una gema", go: "¡Haz combinaciones!", collected: "Gemas: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  blast: {
    ru: { title: "Взрывай камни —\nзабирай бонус", tap: "Тапни группу камней", go: "Ищи большие группы!", blasted: "Камней: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Підривай камені —\nзабирай бонус", tap: "Тисни на групу каменів", go: "Шукай великі групи!", blasted: "Каменів: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Blast the gems\nand win", tap: "Tap a group of gems", go: "Go for big groups!", blasted: "Gems: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Explota gemas\ny gana", tap: "Toca un grupo de gemas", go: "¡Busca grupos grandes!", blasted: "Gemas: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  cut: {
    ru: { title: "Режь монеты —\nзабирай бонус", tap: "Проведи пальцем!", go: "Режь! Бомбы не трогай", cutCount: "Разрезано: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Ріж монети —\nзабирай бонус", tap: "Проведи пальцем!", go: "Ріж! Бомби не чіпай", cutCount: "Розрізано: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Slice the coins\nand win", tap: "Swipe to slice!", go: "Slice! Avoid bombs", cutCount: "Sliced: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Corta monedas\ny gana", tap: "¡Desliza para cortar!", go: "¡Corta! Evita bombas", cutCount: "Cortes: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  basket: {
    ru: { title: "Забрось мяч —\nзабери фрибет", tap: "Свайп вверх — бросай", tryAgain: "Почти! Ещё бросок", shotsLeft: "Бросков: ", bonus: "Твой фрибет:", cta: "Забрать фрибет" },
    uk: { title: "Закинь м'яч —\nзабери фрібет", tap: "Свайп угору — кидай", tryAgain: "Майже! Ще кидок", shotsLeft: "Кидків: ", bonus: "Твій фрібет:", cta: "Забрати фрібет" },
    en: { title: "Sink the shot\nwin a free bet", tap: "Swipe up to shoot", tryAgain: "So close! Again", shotsLeft: "Shots: ", bonus: "Your free bet:", cta: "Claim free bet" },
    es: { title: "Encesta y gana\nuna apuesta gratis", tap: "Desliza para tirar", tryAgain: "¡Casi! Otra vez", shotsLeft: "Tiros: ", bonus: "Tu apuesta gratis:", cta: "Reclamar" },
  },
  penalty: {
    ru: { title: "Забей пенальти —\nзабери фрибет", tap: "Свайп к воротам — бей", tryAgain: "Сейв! Ещё удар", kicksLeft: "Ударов: ", bonus: "Твой фрибет:", cta: "Забрать фрибет" },
    uk: { title: "Забий пенальті —\nзабери фрібет", tap: "Свайп до воріт — бий", tryAgain: "Сейв! Ще удар", kicksLeft: "Ударів: ", bonus: "Твій фрібет:", cta: "Забрати фрібет" },
    en: { title: "Score the penalty\nwin a free bet", tap: "Swipe to shoot", tryAgain: "Saved! Shoot again", kicksLeft: "Kicks: ", bonus: "Your free bet:", cta: "Claim free bet" },
    es: { title: "Marca el penalti\ny gana", tap: "Desliza para chutar", tryAgain: "¡Parada! Otra vez", kicksLeft: "Tiros: ", bonus: "Tu apuesta gratis:", cta: "Reclamar" },
  },
  roulette: {
    ru: { title: "Ставь на красное —\nзабирай бонус", tap: "Жми, чтобы крутить", tryAgain: "Зеро! Крути ещё", spinsLeft: "Запусков: ", bet: "Ставка: красное", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Став на червоне —\nзабирай бонус", tap: "Тисни, щоб крутити", tryAgain: "Зеро! Крути ще", spinsLeft: "Запусків: ", bet: "Ставка: червоне", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Bet on red\nand win", tap: "Tap to spin", tryAgain: "Zero! Spin again", spinsLeft: "Spins: ", bet: "Bet: red", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Apuesta al rojo\ny gana", tap: "Toca para girar", tryAgain: "¡Cero! Otra vez", spinsLeft: "Giros: ", bet: "Apuesta: rojo", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  mines: {
    ru: { title: "Найди алмазы —\nзабери ×10", tap: "Открывай клетки", tryAgain: "Бум! Ещё раунд", mult: "Множитель ×", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Знайди діаманти —\nзабери ×10", tap: "Відкривай клітинки", tryAgain: "Бум! Ще раунд", mult: "Множник ×", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Find the gems\nwin ×10", tap: "Open the tiles", tryAgain: "Boom! One more round", mult: "Multiplier ×", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Encuentra gemas\ny gana ×10", tap: "Abre las casillas", tryAgain: "¡Bum! Otra ronda", mult: "Multiplicador ×", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  cases: {
    ru: { title: "Открой кейс —\nвыбей легендарку", tap: "Жми, чтобы открыть", tryAgain: "Почти легендарка! Ещё кейс", opensLeft: "Кейсов: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Відкрий кейс —\nвибий легендарку", tap: "Тисни, щоб відкрити", tryAgain: "Майже легендарка! Ще кейс", opensLeft: "Кейсів: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Open the case\nhit a legendary", tap: "Tap to open", tryAgain: "So close! One more case", opensLeft: "Cases: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Abre la caja\nconsigue legendario", tap: "Toca para abrir", tryAgain: "¡Casi! Otra caja", opensLeft: "Cajas: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  claw: {
    ru: { title: "Хватай приз —\nзабирай бонус", tap: "Жми, чтобы хватать", tryAgain: "Выскользнул! Ещё попытка", triesLeft: "Попыток: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Хапай приз —\nзабирай бонус", tap: "Тисни, щоб хапати", tryAgain: "Вислизнув! Ще спроба", triesLeft: "Спроб: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Grab the prize\nand win", tap: "Tap to grab", tryAgain: "It slipped! Try again", triesLeft: "Tries: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Atrapa el premio\ny gana", tap: "Toca para atrapar", tryAgain: "¡Se escapó! Otra vez", triesLeft: "Intentos: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  darts: {
    ru: { title: "Попади в джекпот —\nзабери бонус", tap: "Свайп вверх — бросай", tryAgain: "Почти! Ещё бросок", throwsLeft: "Бросков: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Влуч у джекпот —\nзабери бонус", tap: "Свайп угору — кидай", tryAgain: "Майже! Ще кидок", throwsLeft: "Кидків: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Hit the jackpot\nand win", tap: "Swipe up to throw", tryAgain: "So close! Throw again", throwsLeft: "Throws: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Da en el jackpot\ny gana", tap: "Desliza para lanzar", tryAgain: "¡Casi! Otro tiro", throwsLeft: "Tiros: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  dice: {
    ru: { title: "Выбрось дубль —\nзабери бонус", tap: "Жми, чтобы бросить", tryAgain: "Почти! Ещё бросок", goal: "Цель: ", sum: "Выпало: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Викинь дубль —\nзабери бонус", tap: "Тисни, щоб кинути", tryAgain: "Майже! Ще кидок", goal: "Ціль: ", sum: "Випало: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Roll a double\nand win", tap: "Tap to roll", tryAgain: "So close! Roll again", goal: "Goal: ", sum: "Rolled: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Saca dobles\ny gana", tap: "Toca para lanzar", tryAgain: "¡Casi! Otra vez", goal: "Meta: ", sum: "Salió: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  catcher: {
    ru: { title: "Лови монеты —\nзабирай бонус", tap: "Веди котёл пальцем", go: "Лови монеты!", caught: "Монет: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Лови монети —\nзабирай бонус", tap: "Веди казан пальцем", go: "Лови монети!", caught: "Монет: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Catch the coins\nand win", tap: "Drag the pot", go: "Catch them!", caught: "Coins: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Atrapa monedas\ny gana", tap: "Mueve la olla", go: "¡Atrápalas!", caught: "Monedas: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  memory: {
    ru: { title: "Найди пары\nи забери бонус", memo: "Запоминай!", tap: "Открывай карты", pairs: "Пар: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Знайди пари\nі забери бонус", memo: "Запам'ятовуй!", tap: "Відкривай карти", pairs: "Пар: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Match the pairs\nand win", memo: "Remember!", tap: "Flip the cards", pairs: "Pairs: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Encuentra parejas\ny gana", memo: "¡Memoriza!", tap: "Voltea las cartas", pairs: "Parejas: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  plinko: {
    ru: { title: "Брось шарик —\nпоймай ×100", tap: "Жми, чтобы бросить", tryAgain: "Мимо! Ещё шарик", ballsLeft: "Шариков: ", bonus: "Твой выигрыш:", cta: "Забрать выигрыш" },
    uk: { title: "Кинь кульку —\nспіймай ×100", tap: "Тисни, щоб кинути", tryAgain: "Повз! Ще кулька", ballsLeft: "Кульок: ", bonus: "Твій виграш:", cta: "Забрати виграш" },
    en: { title: "Drop the ball —\ncatch ×100", tap: "Tap to drop", tryAgain: "Missed! One more", ballsLeft: "Balls: ", bonus: "You won:", cta: "Claim prize" },
    es: { title: "Suelta la bola,\natrapa ×100", tap: "Toca para soltar", tryAgain: "¡Casi! Otra bola", ballsLeft: "Bolas: ", bonus: "Ganaste:", cta: "Reclamar premio" },
  },
  aviator: {
    ru: { title: "Лети выше —\nзабирай больше", tap: "Жми, чтобы взлететь", cashout: "Забрать", cashoutHint: "Жми — забирай!", won: "Забрал", bonus: "Твой выигрыш:", cta: "Забрать выигрыш" },
    uk: { title: "Лети вище —\nзабирай більше", tap: "Тисни, щоб злетіти", cashout: "Забрати", cashoutHint: "Тисни — забирай!", won: "Забрав", bonus: "Твій виграш:", cta: "Забрати виграш" },
    en: { title: "Fly higher —\nwin bigger", tap: "Tap to take off", cashout: "Cash out", cashoutHint: "Tap to cash out!", won: "Cashed", bonus: "You won:", cta: "Claim prize" },
    es: { title: "Vuela más alto,\ngana más", tap: "Toca para despegar", cashout: "Cobrar", cashoutHint: "¡Toca y cobra!", won: "Cobrado", bonus: "Ganaste:", cta: "Reclamar premio" },
  },
  chests: {
    ru: { title: "Выбери сундук\nи забери золото", tap: "Жми на сундук", empty: "Пусто!", shuffle: "Следи за сундуками!", tryAgain: "Где золото? Выбирай!", triesLeft: "Попыток: ", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Обери скриню\nі забери золото", tap: "Тисни на скриню", empty: "Порожньо!", shuffle: "Стеж за скринями!", tryAgain: "Де золото? Обирай!", triesLeft: "Спроб: ", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Pick a chest\nand grab the gold", tap: "Tap a chest", empty: "Empty!", shuffle: "Watch the chests!", tryAgain: "Where's the gold? Pick!", triesLeft: "Tries: ", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Elige un cofre\ny llévate el oro", tap: "Toca un cofre", empty: "¡Vacío!", shuffle: "¡Sigue los cofres!", tryAgain: "¿Dónde está el oro? ¡Elige!", triesLeft: "Intentos: ", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
  slot: {
    ru: { title: "Крути слот\nи срывай джекпот", tap: "Жми, чтобы крутить", tryAgain: "Почти! Ещё спин", spinsLeft: "Спинов: ", bonus: "Твой джекпот:", cta: "Забрать джекпот" },
    uk: { title: "Крути слот\nі зривай джекпот", tap: "Тисни, щоб крутити", tryAgain: "Майже! Ще спін", spinsLeft: "Спінів: ", bonus: "Твій джекпот:", cta: "Забрати джекпот" },
    en: { title: "Spin the slot\nhit the jackpot", tap: "Tap to spin", tryAgain: "So close! Spin again", spinsLeft: "Spins: ", bonus: "Your jackpot:", cta: "Claim jackpot" },
    es: { title: "Gira el slot\ny gana el jackpot", tap: "Toca para girar", tryAgain: "¡Casi! Otro giro", spinsLeft: "Giros: ", bonus: "Tu jackpot:", cta: "Reclamar jackpot" },
  },
  scratch: {
    ru: { title: "Сотри\nи выиграй", tap: "Найди три одинаковых", won: "Три монеты!", bonus: "Твой бонус:", cta: "Забрать бонус" },
    uk: { title: "Зітри\nі виграй", tap: "Знайди три однакових", won: "Три монети!", bonus: "Твій бонус:", cta: "Забрати бонус" },
    en: { title: "Scratch\nand win", tap: "Find three of a kind", won: "Three coins!", bonus: "Your bonus:", cta: "Claim bonus" },
    es: { title: "Rasca\ny gana", tap: "Encuentra tres iguales", won: "¡Tres monedas!", bonus: "Tu bono:", cta: "Reclamar bono" },
  },
};

const PRIZES: Record<SceneLang, string[]> = {
  ru: ["100 FS", "x2", "50 FS", "500 FS", "200%", "25 FS", "x3", "ДЖЕКПОТ"],
  uk: ["100 FS", "x2", "50 FS", "500 FS", "200%", "25 FS", "x3", "ДЖЕКПОТ"],
  en: ["100 FS", "x2", "50 FS", "500 FS", "200%", "25 FS", "x3", "JACKPOT"],
  es: ["100 GG", "x2", "50 GG", "500 GG", "200%", "25 GG", "x3", "JACKPOT"],
};
/** Сектор, на котором колесо остановится, — «500 FS» в пресете. */
export const DEFAULT_WIN_INDEX = 3;

export function scenePreset(id: SceneId, lang: SceneLang): LangPack {
  return {
    text: { ...TEXT[id][lang] },
    unit: UNIT_BY_SCENE[id]?.[lang] ?? UNIT[lang],
    legal: LEGAL[lang],
    ...(id === "wheel" ? { prizes: [...PRIZES[lang]] } : {}),
  };
}

// ---- стиль сцены: промпт для всей ИИ-графики + палитра интерфейса и колеса

export type WheelPalette = {
  /** Сектора: светлый центр → тёмный край. */
  a: [string, string];
  b: [string, string];
  win: [string, string];
  /** Разделители секторов. */
  line: string;
  /** Подписи и их обводка; на выигрышном секторе — свои. */
  ink: string;
  stroke: string;
  winInk: string;
  winStroke: string;
};

/** Цвета интерфейса сцены: градиент заголовков, обводка, плашки. */
export type UiPalette = {
  g1: string; g2: string; g3: string; g4: string; ink: string; accent: string; rim: string;
  /** Плашки (счётчик нажатий, прогресс): верх и низ градиента. Нет — тёмно-коричневые по умолчанию. */
  plate1?: string; plate2?: string;
};

export type SceneStyle = {
  id: string;
  label: string;
  /** Материалы и палитра для ИИ — общие для всех деталей сцены. */
  prompt: string;
  palette: WheelPalette;
  ui: UiPalette;
  swatch: string[];
};

export const SCENE_STYLES: SceneStyle[] = [
  {
    id: "ruby",
    label: "Золото и рубин",
    prompt: "polished yellow gold with deep red rubies and a warm golden glow, classic luxury casino",
    palette: {
      a: ["#ff5c7a", "#9b1030"], b: ["#4a2f9a", "#1a0d44"], win: ["#fff2a8", "#e08a1c"],
      line: "#f2c26a", ink: "#ffffff", stroke: "#3a0a14", winInk: "#5a2406", winStroke: "#fff3c0",
    },
    ui: { g1: "#fff7c2", g2: "#ffd45c", g3: "#e08a22", g4: "#b9561a", ink: "#2a1205", accent: "#ffbb58", rim: "#d99a46" },
    swatch: ["#e2a23e", "#c2183c", "#3a2580"],
  },
  {
    id: "neon",
    label: "Неон",
    prompt: "glossy dark chrome with glowing cyan and magenta neon light, cyberpunk night casino",
    palette: {
      a: ["#ff4fd8", "#6a0a5c"], b: ["#2fd4ff", "#06395a"], win: ["#fff7a8", "#ffb21c"],
      line: "#c9f6ff", ink: "#ffffff", stroke: "#1a0630", winInk: "#4a2200", winStroke: "#fffbd8",
    },
    ui: { g1: "#f0feff", g2: "#7ff0ff", g3: "#ff5ad8", g4: "#9a1a8a", ink: "#1a0630", accent: "#7ff0ff", rim: "#ff5ad8" },
    swatch: ["#2fd4ff", "#ff4fd8", "#1a0630"],
  },
  {
    id: "emerald",
    label: "Изумруд",
    prompt: "polished gold with large emerald gems and a warm green glow, lucky royal green casino",
    palette: {
      a: ["#3ddc84", "#0a5a2e"], b: ["#1a2a22", "#050c08"], win: ["#fff2a8", "#e0a21c"],
      line: "#f2d36a", ink: "#ffffff", stroke: "#03200f", winInk: "#4a2a06", winStroke: "#fff6c8",
    },
    ui: { g1: "#f4fff0", g2: "#a8f59a", g3: "#21b45a", g4: "#0a5a26", ink: "#03200f", accent: "#9cf59a", rim: "#e8c04a" },
    swatch: ["#e8c04a", "#1fa85a", "#0c1a12"],
  },
  {
    id: "ice",
    label: "Серебро и лёд",
    prompt: "polished silver and platinum with icy blue crystals and a cold white glow, frosty premium casino",
    palette: {
      a: ["#8fd8ff", "#1a5a9a"], b: ["#e8eef6", "#7a8aa0"], win: ["#fff2a8", "#e0a21c"],
      line: "#ffffff", ink: "#0a2a4a", stroke: "#ffffff", winInk: "#4a2a06", winStroke: "#fff6c8",
    },
    ui: { g1: "#ffffff", g2: "#d8f0ff", g3: "#6ab8f0", g4: "#1a4a8a", ink: "#0a1a3a", accent: "#bfe8ff", rim: "#8fd8ff" },
    swatch: ["#d8e2ee", "#5ab8f0", "#1a3a6a"],
  },
  {
    id: "royal",
    label: "Королевский пурпур",
    prompt: "rich royal purple velvet with polished gold ornaments and amethyst gems, regal palace casino",
    palette: {
      a: ["#b46cff", "#4a0a8a"], b: ["#ffd45c", "#a8600a"], win: ["#ffffff", "#e8c4ff"],
      line: "#ffe08a", ink: "#ffffff", stroke: "#2a0650", winInk: "#3a0a6a", winStroke: "#ffffff",
    },
    ui: { g1: "#fff2ff", g2: "#e8b4ff", g3: "#a04ae8", g4: "#5a1a9a", ink: "#1e0638", accent: "#e8b4ff", rim: "#ffd45c" },
    swatch: ["#ffd45c", "#9a3ae8", "#2a0650"],
  },
  {
    id: "fire",
    label: "Огонь",
    prompt: "blazing fire and molten lava with glowing orange embers and dark iron, hot volcanic casino",
    palette: {
      a: ["#ff8a3c", "#9a2a06"], b: ["#3a1a12", "#120604"], win: ["#fff2a8", "#ffb21c"],
      line: "#ffc06a", ink: "#ffffff", stroke: "#2a0604", winInk: "#4a1a04", winStroke: "#fff3c0",
    },
    ui: { g1: "#fff4d0", g2: "#ffc23c", g3: "#ff6a1c", g4: "#a8200a", ink: "#2a0604", accent: "#ffb05a", rim: "#ff6a1c" },
    swatch: ["#ffc23c", "#ff4a1c", "#2a0604"],
  },
];

export function sceneStyle(id: string | undefined): SceneStyle {
  return SCENE_STYLES.find((s) => s.id === id) ?? SCENE_STYLES[0];
}

// ---- ИИ-детали сцен: что именно рисует OpenAI для каждой игры

export type PartKind = "object" | "symbols" | "wheel-frame" | "wheel-pointer" | "wheel-hub" | "scene-bg" | "reward";

export type ScenePart = {
  /** Ключ в art (или "symbols", "bg", "reward"). */
  id: string;
  kind: PartKind;
  label: string;
  hint: string;
  /** Что рисовать — для object и symbols. */
  subject?: string;
  /** До какого размера ужимать спрайт, px. */
  size?: number;
};

const BG_PART: ScenePart = { id: "bg", kind: "scene-bg", label: "Фон", hint: "Квадрат — и для телефона, и для десктопа" };
const REWARD_PART: ScenePart = { id: "reward", kind: "reward", label: "Награда в попапе", hint: "Предмет на прозрачном фоне" };
const BOMB_PART: ScenePart = {
  id: "bomb", kind: "object", label: "Бомба", hint: "Её трогать нельзя", size: 220,
  subject: "a round cartoon bomb with a short lit fuse and a bright spark, glossy",
};
const GEMS =
  "six different faceted precious GEMS for a match game, each a clearly different colour and cut: red ruby, blue sapphire, green emerald, yellow topaz, purple amethyst, orange citrine";

export const SCENE_PARTS: Record<SceneId, ScenePart[]> = {
  safe: [
    {
      id: "door", kind: "object", label: "Хранилище", hint: "Сейф, сундук, шкатулка ведьмы — по теме; диск ляжет поверх", size: 700,
      subject:
        "the FRONT of the locked treasure container of this game — a bank vault door by default, but shaped by the theme (a dragon-scale vault, a carved treasure chest front, a witch's sealed cabinet, a sci-fi blast door…), seen perfectly straight-on (flat front view, no perspective), a tall rectangle filling the canvas, with a big EMPTY round recess in the upper middle where a rotating lock dial will be placed — draw NO dial, NO numbers, NO handle inside the recess",
    },
    {
      id: "dial", kind: "object", label: "Кодовый диск", hint: "Крутится на дверце — руны, часы, печать по теме", size: 420,
      subject:
        "a round rotating LOCK DIAL seen perfectly straight-on, a perfect circle filling the canvas: a combination dial by default, but shaped by the theme (a runic seal, a clock face, a magic sigil, a cyber lock…), with radial ticks or symbols around the rim and a decorative knob in the centre; NO readable text or digits",
    },
    {
      id: "inside", kind: "object", label: "Содержимое", hint: "Видно, когда хранилище открылось", size: 700,
      subject:
        "the INSIDE of the opened treasure container of this game seen perfectly straight-on: a deep dark cavity with shelves or a nest, piled with a glowing hoard that fits the theme (gold bars and coins by default; crystals, potions, relics, data cores…), a tall rectangle filling the canvas edge to edge, warm light from inside, no door, no frame around it",
    },
    {
      id: "token", kind: "object", label: "Жетон", hint: "Поинты на плашке: по одному за нажатие", size: 200,
      subject:
        "a single round TOKEN seen straight-on, a perfect circle filling the canvas: a gold coin with an emblem by default, but shaped by the theme (a rune stone, an amulet, a gem medallion, a cyber chip…); NO text or digits",
    },
  ],
  wheel: [
    { id: "frame", kind: "wheel-frame", label: "Рама колеса", hint: "Обод с лампочками — главный объект" },
    { id: "pointer", kind: "wheel-pointer", label: "Указатель", hint: "Щёлкает на каждом секторе" },
    { id: "hub", kind: "wheel-hub", label: "Центр колеса", hint: "Медальон в середине" },
  ],
  scratch: [
    {
      id: "symbols", kind: "symbols", label: "Символы под фольгой", hint: "6 иконок; первая — выигрышная, их три",
      subject: "lucky scratch-card symbols; the FIRST icon (top-left) is the jackpot symbol — a big golden coin with a star; the other five are different lucky symbols",
    },
  ],
  slot: [
    {
      id: "symbols", kind: "symbols", label: "Символы барабанов", hint: "6 иконок; первая — джекпот (три в ряд)",
      subject: "slot reel symbols; the FIRST icon (top-left) is the jackpot symbol — a big glowing lucky seven; the other five are classic slot symbols",
    },
  ],
  chests: [
    {
      id: "chest", kind: "object", label: "Сундук", hint: "Закрытый — три одинаковых на сцене", size: 440,
      subject: "a closed ornate treasure chest, front view slightly from above, wooden with gold bands, corner plates and a big lock",
    },
    {
      id: "chestOpen", kind: "object", label: "Сундук с золотом", hint: "Открытый — в нём выигрыш", size: 440,
      subject: "the same ornate treasure chest but OPEN with the lid up, overflowing with glowing gold coins and gems, front view slightly from above",
    },
    {
      id: "chestEmpty", kind: "object", label: "Пустой сундук", hint: "Открытый, без добычи — первая попытка", size: 440,
      subject: "the same ornate treasure chest but OPEN with the lid up and completely EMPTY inside — just a dark bare bottom, a cobweb and some dust, no coins, no gems; front view slightly from above",
    },
  ],
  aviator: [
    {
      id: "plane", kind: "object", label: "Самолёт", hint: "Летит по графику вправо-вверх", size: 380,
      subject: "a sleek stylized propeller airplane flying to the RIGHT, side view, glossy paint",
    },
  ],
  plinko: [
    { id: "ball", kind: "object", label: "Шарик", hint: "Скачет по штырькам", size: 140, subject: "a single glowing glossy game ball, perfect sphere" },
  ],
  memory: [
    { id: "symbols", kind: "symbols", label: "Лица карт", hint: "Нужны первые 4 из 6", subject: "card-matching game symbols: six clearly different lucky casino icons" },
    {
      id: "cardBack", kind: "object", label: "Рубашка карты", hint: "Одна на все карты", size: 320,
      subject: "the BACK of a premium playing card: a vertical rounded rectangle filling the canvas, ornate border and an emblem in the centre, NO text",
    },
  ],
  catcher: [
    { id: "coin", kind: "object", label: "Что ловим", hint: "Падает сверху", size: 200, subject: "a shiny thick gold casino coin with a star emblem, slightly tilted" },
    { id: "pot", kind: "object", label: "Котёл", hint: "Ловит монеты", size: 360, subject: "a pot of gold / golden cauldron seen from the front, wide open top, empty inside" },
    BOMB_PART,
  ],
  basket: [
    { id: "ball", kind: "object", label: "Мяч", hint: "Летит в кольцо", size: 240, subject: "a glossy basketball, perfect sphere, classic seams" },
    {
      id: "board", kind: "object", label: "Щит", hint: "За кольцом; кольцо и сетка остаются живыми", size: 520,
      subject:
        "a basketball BACKBOARD only, seen perfectly straight-on, a wide landscape rectangle filling the canvas: a glass board by default, but shaped by the theme (carved stone, neon panel, wooden shield…), with a small target square in the lower middle; NO hoop, NO rim, NO net, NO pole",
    },
  ],
  roulette: [
    {
      id: "cone", kind: "object", label: "Центр колеса", hint: "Крутится вместе с ячейками", size: 500,
      subject:
        "the round central TURRET of a roulette wheel seen from directly above, a perfect circle filling the canvas: a polished cone with radial spokes and a knob in the middle by default, but ornamented by the theme (a rune compass, a clockwork rose, a dragon emblem…); NO numbers, NO pockets",
    },
  ],
  claw: [{ id: "symbols", kind: "symbols", label: "Призы в автомате", hint: "6 штук", subject: "six cute glossy arcade prizes for a claw machine: a gold coin, a blue diamond, a lucky seven, a cherry plush, a golden bell, a gold bar" }],
  darts: [
    {
      id: "dart", kind: "object", label: "Дротик", hint: "Летит в мишень и остаётся в ней", size: 400,
      subject:
        "a single throwing DART seen from the side, pointing straight UP: the sharp tip at the very top, the flights at the bottom, thin and vertical, shaped by the theme (a feathered arrow-dart, a crystal dart, a cyber dart…)",
    },
  ],
  dice: [
    {
      id: "cup", kind: "object", label: "Стакан", hint: "Трясёт и высыпает кубики", size: 360,
      subject:
        "a dice-shaker CUP turned upside down, seen from the front: closed bottom at the top, the open mouth facing DOWN at the bottom, a leather cup by default, but shaped by the theme (a carved goblet, a skull chalice, a chrome canister…); no dice",
    },
  ],
  mines: [
    { id: "gem", kind: "object", label: "Алмаз", hint: "Под клеткой", size: 220, subject: "a single glowing faceted blue diamond gem, front view" },
    { id: "bomb", kind: "object", label: "Бомба", hint: "Под клеткой", size: 220, subject: "a cartoon black round bomb with a lit fuse and sparks" },
    {
      id: "tile", kind: "object", label: "Закрытая клетка", hint: "25 штук на поле", size: 200,
      subject:
        "one CLOSED tile of a minefield grid seen straight-on, a rounded square filling the canvas: a glossy button by default, but shaped by the theme (a stone slab with a rune, a wooden crate lid, a sci-fi hatch…); NO text or digits",
    },
  ],
  cases: [
    {
      id: "symbols", kind: "symbols", label: "Предметы ленты", hint: "6 штук; шестой — легендарка",
      subject: "six loot items of rising rarity for a case-opening game: a coin, a cherry, a bell, a gold bar, a lucky seven and, last, a legendary glowing golden diamond",
    },
    {
      id: "case", kind: "object", label: "Кейс", hint: "Трясётся и открывается", size: 420,
      subject:
        "a closed LOOT CASE seen from the front, slightly from above: a premium lockable box by default, but shaped by the theme (a runic chest, a witch's trunk, a cyber crate…), wider than tall, with a lock in the middle",
    },
  ],
  penalty: [
    { id: "ball", kind: "object", label: "Мяч", hint: "Летит в ворота", size: 240, subject: "a glossy classic football (soccer ball), perfect sphere, black and white panels" },
    { id: "keeper", kind: "object", label: "Вратарь", hint: "Стоит в воротах", size: 420, subject: "a stylized cartoon football goalkeeper, full body, front view, arms raised with big gloves, generic kit without logos or numbers, non-identifiable" },
  ],
  cut: [
    { id: "symbols", kind: "symbols", label: "Что режем", hint: "6 предметов", subject: "six different juicy casino treasures to slice: coins, gems, a lucky seven, a cherry, a star, a gold bar" },
    BOMB_PART,
  ],
  blast: [{ id: "symbols", kind: "symbols", label: "Самоцветы", hint: "Нужны первые 4 из 6", subject: GEMS }],
  match3: [{ id: "symbols", kind: "symbols", label: "Самоцветы", hint: "Нужны первые 5 из 6", subject: GEMS }],
  quiz: [
    {
      id: "mascot", kind: "object", label: "Ведущий", hint: "Персонаж рядом с вопросом", size: 460,
      subject: "a friendly cartoon game-show host mascot character, upper body, smiling and pointing, fully clothed",
    },
  ],
};

/** Все детали сцены по порядку: объекты игры, потом фон и награда. */
export function scenePartsFor(id: SceneId): ScenePart[] {
  return [...SCENE_PARTS[id], BG_PART, REWARD_PART];
}
