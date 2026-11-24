// Проверка перед модерацией: правила рекламных сетей и стран (GEO) для
// iGaming-креативов. Общее для клиента и сервера.
//
// Пункт с check:"visual" модель проверяет по картинке, а "info" — напоминание,
// которое по одному баннеру не проверить (лицензия, таргетинг, сертификат).
// Это предпроверка, а не юридическая консультация: правила сетей и регуляторов
// меняются, тексты ниже — частые требования, сверять с первоисточником.

export type ComplianceSeverity = "block" | "warn";

export type ComplianceRule = {
  id: string;
  /** Что должно быть (или чего не должно быть) — по-русски, коротко. */
  text: string;
  severity: ComplianceSeverity;
  check: "visual" | "info";
  /** Что добавить или убрать, если не выполнено. */
  fix?: string;
};

export type ComplianceNetworkId = "meta" | "google" | "tiktok" | "push" | "inapp";

export const COMPLIANCE_NETWORKS: { id: ComplianceNetworkId; label: string; hint: string; rules: ComplianceRule[] }[] = [
  {
    id: "meta",
    label: "Meta",
    hint: "Facebook, Instagram",
    rules: [
      { id: "meta-i1", check: "info", severity: "block", text: "Гемблинг в Meta — только с письменного разрешения Meta и лицензией в стране показа; таргет 18+ (в части стран выше)" },
      { id: "meta-v1", check: "visual", severity: "warn", text: "Нет шокирующих и сенсационных образов, «до/после», пачек денег как обещания разбогатеть", fix: "Уберите деньги-как-результат и сенсационные образы" },
    ],
  },
  {
    id: "google",
    label: "Google Ads",
    hint: "Поиск, КМС (GDN), YouTube",
    rules: [
      { id: "google-i1", check: "info", severity: "block", text: "Гемблинг в Google — только после сертификации Google и при лицензии в стране показа" },
      { id: "google-i2", check: "info", severity: "warn", text: "GIF в КМС: до 150 КБ, анимация не дольше 30 с, без стробоскопа" },
      { id: "google-v1", check: "visual", severity: "block", text: "Картинка чёткая и читаемая: текст не размыт, не обрезан, не перевёрнут", fix: "Перегенерируйте или увеличьте текст" },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    hint: "TikTok Ads",
    rules: [
      { id: "tiktok-i1", check: "info", severity: "block", text: "Реклама азартных игр на деньги в TikTok — только в отдельных странах и по предварительному одобрению" },
      { id: "tiktok-v1", check: "visual", severity: "warn", text: "Игра не подаётся как способ заработка, стиль жизни или путь к богатству", fix: "Смягчите подачу: развлечение, а не заработок" },
    ],
  },
  {
    id: "push",
    label: "Push / Pop / Native",
    hint: "PropellerAds, RichAds, TrafficStars и др.",
    rules: [
      { id: "push-v1", check: "visual", severity: "block", text: "Не имитирует системное уведомление, окно ОС, пропущенный звонок или сообщение мессенджера", fix: "Уберите элементы, похожие на системный интерфейс" },
      { id: "push-v2", check: "visual", severity: "warn", text: "Не выдаёт себя за новость или статью СМИ с чужим логотипом", fix: "Уберите логотипы СМИ и «новостную» подачу" },
    ],
  },
  {
    id: "inapp",
    label: "In-app сети",
    hint: "AppLovin, Unity, Mintegral",
    rules: [
      { id: "inapp-i1", check: "info", severity: "block", text: "Только для лицензированных операторов; таргет 21+, возрастной гейт на лендинге" },
      { id: "inapp-v1", check: "visual", severity: "warn", text: "На креативе есть дисклеймер о возрасте и ответственной игре", fix: "Добавьте «18+/21+» и строку об ответственной игре" },
    ],
  },
];

/** Требования, общие для всех сетей и стран. */
export const COMPLIANCE_COMMON: ComplianceRule[] = [
  { id: "c1", check: "visual", severity: "block", text: "Нет гарантий выигрыша («100% выигрыш», «точно выиграешь»), «лёгких денег», заработка или решения финансовых проблем (обычные «Большие выигрыши», «Джекпот» допустимы)", fix: "Замените на нейтральное: «Играй», «Бонус на первый депозит»" },
  { id: "c2", check: "visual", severity: "block", text: "Нет детей и подростков, нет образов, рассчитанных в первую очередь на несовершеннолетних", fix: "Взрослый персонаж, без детской стилистики" },
  { id: "c3", check: "visual", severity: "block", text: "Нет поддельного интерфейса: фальшивых кнопок «Закрыть», «Скачать», плеера, полос загрузки", fix: "Оставьте одну честную кнопку-призыв" },
  { id: "c4", check: "visual", severity: "warn", text: "Нет знаменитостей и чужих брендов (логотипы, App Store, Google Play) без прав", fix: "Уберите узнаваемые лица и чужие логотипы" },
  { id: "c5", check: "visual", severity: "warn", text: "Нет ложной срочности: таймеров, «осталось 2 места», «только сегодня» без реального ограничения", fix: "Уберите таймер или сделайте акцию реальной" },
  { id: "c6", check: "visual", severity: "warn", text: "Если указана сумма бонуса — рядом есть пометка об условиях («Условия на сайте», «T&C apply»)", fix: "Добавьте мелкую строку об условиях бонуса" },
];

export type ComplianceGeoId = "any" | "uk" | "de" | "fr" | "es" | "it" | "us" | "ca" | "br" | "ua" | "kz" | "in";

export const COMPLIANCE_GEOS: {
  id: ComplianceGeoId;
  label: string;
  /** Как это GEO пишут в ТЗ: названия и коды (нижний регистр, начало слова). */
  aliases: string[];
  rules: ComplianceRule[];
}[] = [
  {
    id: "any",
    label: "Другое / не знаю",
    aliases: [],
    rules: [
      { id: "g-any1", check: "visual", severity: "warn", text: "Есть отметка возраста (18+ или 21+)", fix: "Добавьте «18+» в угол баннера" },
      { id: "g-any2", check: "visual", severity: "warn", text: "Есть строка об ответственной игре на языке креатива", fix: "Добавьте «Играйте ответственно» на языке GEO" },
      { id: "g-anyi", check: "info", severity: "block", text: "Проверьте, что оффер легален в стране показа: в части стран онлайн-казино запрещено" },
    ],
  },
  {
    id: "uk",
    label: "Великобритания",
    aliases: ["великобритан", "англи", "uk", "gb", "united kingdom", "britain", "england"],
    rules: [
      { id: "g-uk1", check: "visual", severity: "block", text: "Есть «18+»", fix: "Добавьте «18+»" },
      { id: "g-uk2", check: "visual", severity: "block", text: "Есть сообщение о безопасной игре и BeGambleAware.org (или «Take time to think»)", fix: "Добавьте «18+ | BeGambleAware.org»" },
      { id: "g-uk3", check: "visual", severity: "block", text: "Нет образов с сильной привлекательностью для младше 18: мультяшные герои детской стилистики, молодёжные кумиры", fix: "Взрослый реалистичный персонаж" },
      { id: "g-uk4", check: "visual", severity: "warn", text: "У бонуса указаны ключевые условия (вейджер, минимальный депозит) или «Full T&Cs apply»", fix: "Добавьте ключевые условия бонуса мелким шрифтом" },
    ],
  },
  {
    id: "de",
    label: "Германия",
    aliases: ["герман", "de", "germany", "deutsch", "dach"],
    rules: [
      { id: "g-de1", check: "visual", severity: "block", text: "Есть «18+»", fix: "Добавьте «18+»" },
      { id: "g-de2", check: "visual", severity: "block", text: "Есть предупреждение «Glücksspiel kann süchtig machen» и ссылка на помощь (check-dein-spiel.de / 0800 1 37 27 00)", fix: "Добавьте «18+ | Glücksspiel kann süchtig machen. Hilfe: check-dein-spiel.de»" },
      { id: "g-dei", check: "info", severity: "block", text: "Оператор должен быть в белом списке GGL (Gemeinsame Glücksspielbehörde der Länder)" },
    ],
  },
  {
    id: "fr",
    label: "Франция",
    aliases: ["франц", "fr", "france"],
    rules: [
      { id: "g-fr1", check: "visual", severity: "block", text: "Есть «Interdit aux mineurs» / «18+»", fix: "Добавьте «Interdit aux moins de 18 ans»" },
      { id: "g-fr2", check: "visual", severity: "block", text: "Есть предупреждение о рисках и номер помощи (Joueurs Info Service, 09 74 75 13 13)", fix: "Добавьте «Jouer comporte des risques… Appelez le 09 74 75 13 13»" },
      { id: "g-fri", check: "info", severity: "block", text: "Онлайн-казино во Франции не легализовано — допустимы ставки на спорт, скачки и покер у операторов с лицензией ANJ" },
    ],
  },
  {
    id: "es",
    label: "Испания",
    aliases: ["испан", "es", "spain", "españa", "espana"],
    rules: [
      { id: "g-es1", check: "visual", severity: "block", text: "Есть «+18» и «Juega con responsabilidad» / jugarbien.es", fix: "Добавьте «+18 | Juega con responsabilidad | jugarbien.es»" },
      { id: "g-es2", check: "visual", severity: "block", text: "Нет знаменитостей и узнаваемых публичных лиц", fix: "Замените лицо на сгенерированного персонажа" },
    ],
  },
  {
    id: "it",
    label: "Италия",
    aliases: ["итал", "it", "italy", "italia"],
    rules: [
      { id: "g-iti", check: "info", severity: "block", text: "В Италии реклама азартных игр запрещена почти полностью (Decreto Dignità) — креатив, скорее всего, не пропустят" },
    ],
  },
  {
    id: "us",
    label: "США",
    aliases: ["сша", "америк", "us", "usa", "united states"],
    rules: [
      { id: "g-us1", check: "visual", severity: "block", text: "Есть «21+» (в большинстве штатов)", fix: "Добавьте «21+»" },
      { id: "g-us2", check: "visual", severity: "block", text: "Есть линия помощи: «Gambling problem? Call 1-800-GAMBLER»", fix: "Добавьте «Gambling problem? Call 1-800-GAMBLER»" },
      { id: "g-usi", check: "info", severity: "block", text: "Показ только в штатах, где у оператора есть лицензия" },
    ],
  },
  {
    id: "ca",
    label: "Канада (Онтарио)",
    aliases: ["канад", "онтарио", "ca", "canada", "ontario"],
    rules: [
      { id: "g-ca1", check: "visual", severity: "block", text: "Есть «19+»", fix: "Добавьте «19+»" },
      { id: "g-ca2", check: "visual", severity: "warn", text: "Есть строка об ответственной игре / ConnexOntario", fix: "Добавьте «Play responsibly | ConnexOntario 1-866-531-2600»" },
      { id: "g-ca3", check: "visual", severity: "block", text: "Нет обещаний бонусов и стимулов (в Онтарио реклама бонусов вне сайта оператора запрещена)", fix: "Уберите сумму бонуса, оставьте бренд и игру" },
    ],
  },
  {
    id: "br",
    label: "Бразилия",
    aliases: ["бразил", "br", "brazil", "brasil"],
    rules: [
      { id: "g-br1", check: "visual", severity: "block", text: "Есть «18+» и предупреждение «Jogue com responsabilidade»", fix: "Добавьте «18+ | Jogue com responsabilidade»" },
      { id: "g-br2", check: "visual", severity: "block", text: "Игра не подаётся как заработок или способ решить финансовые проблемы", fix: "Уберите мотивы заработка" },
      { id: "g-bri", check: "info", severity: "block", text: "Оператор должен иметь лицензию Минфина Бразилии (SPA/MF), домен .bet.br" },
    ],
  },
  {
    id: "ua",
    label: "Украина",
    aliases: ["украин", "ua", "ukraine", "україн"],
    rules: [
      { id: "g-ua1", check: "visual", severity: "block", text: "Есть «21+»", fix: "Добавьте «21+»" },
      { id: "g-ua2", check: "visual", severity: "block", text: "Есть предупреждение о риске игровой зависимости на украинском", fix: "Добавьте «Азартні ігри можуть викликати залежність. 21+»" },
      { id: "g-uai", check: "info", severity: "block", text: "Оператор с лицензией в Украине; правила рекламы азартных игр часто меняются — сверьтесь с актуальными" },
    ],
  },
  {
    id: "kz",
    label: "Казахстан",
    aliases: ["казах", "kz", "kazakhstan"],
    rules: [
      { id: "g-kz1", check: "visual", severity: "block", text: "Есть «21+»", fix: "Добавьте «21+»" },
      { id: "g-kzi", check: "info", severity: "block", text: "Онлайн-казино в Казахстане запрещено; допустимы только лицензированные букмекеры" },
    ],
  },
  {
    id: "in",
    label: "Индия",
    aliases: ["инди", "in", "india"],
    rules: [
      { id: "g-in1", check: "visual", severity: "block", text: "Есть дисклеймер: «This game involves an element of financial risk and may be addictive. Please play responsibly and at your own risk.»", fix: "Добавьте дисклеймер ASCI крупно (около 20% площади)" },
      { id: "g-in2", check: "visual", severity: "block", text: "Есть «18+», нет образов младше 18", fix: "Добавьте «18+»" },
      { id: "g-ini", check: "info", severity: "block", text: "В ряде штатов игры на деньги запрещены — исключите их из таргета" },
    ],
  },
];

export const COMPLIANCE_GEO_BY_ID = new Map(COMPLIANCE_GEOS.map((g) => [g.id, g]));
const NETWORK_BY_ID = new Map(COMPLIANCE_NETWORKS.map((n) => [n.id, n]));

export const isNetworkId = (v: unknown): v is ComplianceNetworkId => typeof v === "string" && NETWORK_BY_ID.has(v as ComplianceNetworkId);
export const isGeoId = (v: unknown): v is ComplianceGeoId => typeof v === "string" && COMPLIANCE_GEO_BY_ID.has(v as ComplianceGeoId);

/** Все пункты для выбранных сетей и страны: общие → страна → сети. */
export function complianceRules(networks: ComplianceNetworkId[], geo: ComplianceGeoId): ComplianceRule[] {
  return [
    ...COMPLIANCE_COMMON,
    ...(COMPLIANCE_GEO_BY_ID.get(geo)?.rules ?? []),
    ...networks.flatMap((n) => NETWORK_BY_ID.get(n)?.rules ?? []),
  ];
}

/** GEO из ТЗ («Германия, DACH», «UK», «Tier-1 Канада») → id; не нашли — "any". */
export function geoFromText(text: string | null | undefined): ComplianceGeoId {
  const raw = text ?? "";
  const t = raw.toLowerCase();
  if (!t.trim()) return "any";
  for (const g of COMPLIANCE_GEOS) {
    for (const a of g.aliases) {
      // Коды (UK, DE, IN…) — только заглавными и отдельным словом: «in», «us», «it»
      // в английском тексте — обычные слова. Названия — с начала слова, любой регистр.
      const hit =
        a.length <= 3
          ? new RegExp(`(^|[^\\p{L}])${a.toUpperCase()}([^\\p{L}]|$)`, "u").test(raw)
          : new RegExp(`(^|[^\\p{L}])${a}`, "u").test(t);
      if (hit) return g.id;
    }
  }
  return "any";
}

export type ComplianceResult = { id: string; ok: boolean; note: string };
export type ComplianceVerdict = "pass" | "risk" | "reject";

/** Итог: провален блокирующий пункт → скорее отклонят; предупреждение → риск. */
export function complianceVerdict(rules: ComplianceRule[], results: ComplianceResult[]): ComplianceVerdict {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const failed = results.filter((r) => !r.ok).map((r) => byId.get(r.id)).filter(Boolean) as ComplianceRule[];
  if (failed.some((r) => r.severity === "block")) return "reject";
  return failed.length ? "risk" : "pass";
}
