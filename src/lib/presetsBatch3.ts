// Batch 3 of banner templates (preset47–preset101), distilled from the
// 55 reference creatives in шаблоны/new (Sep 2026). One template per
// reference. Only the STYLE is taken — composition, lighting, typography,
// palette. No specific people, characters, brands, or events from the
// references: those are the user's inputs ({SUBJECT} + template fields).
// Watermarks / copyright marks on the references were ignored.
import {
  FIELD_BONUS_BADGE,
  FIELD_CASINO_PROP,
  FIELD_JACKPOT_TIER,
  FIELD_MATCH_MOMENT,
  FIELD_ODDS_MULT,
  FIELD_SHOW_ODDS,
  FIELD_SPORT,
  FIELD_TIME_OF_DAY,
  FIELD_WIN_CALLOUT,
  type Preset,
} from "./templateFields";

const g = (a: string, b: string, c: string) => `linear-gradient(135deg,${a},${b},${c})`;
const ex = (a: string, b: string, c: string, d: string) => [
  `linear-gradient(135deg,${a},${b})`,
  `linear-gradient(160deg,${c},${d})`,
  `linear-gradient(120deg,${a},${d})`,
  `linear-gradient(140deg,${c},${b})`,
];

export const PRESETS_BATCH_3: Preset[] = [
  {
    id: "preset47",
    fields: [FIELD_CASINO_PROP, FIELD_BONUS_BADGE],
    name: "Кэшбек: маскот и купюры",
    description: "3D-маскот летит сквозь дым, купюры и мешки денег, объёмный бейдж со стрелками",
    gradient: g("#1a0b2e", "#7c3aed", "#f59e0b"),
    examples: ex("#1a0b2e", "#7c3aed", "#2e1065", "#f59e0b"),
    isNew: true,
    template:
      "Create a cashback / money-back promo banner for {SUBJECT}. " +
      "STYLE: glossy 3D cartoon mascot character (invented, non-branded) leaping toward the camera through thick violet smoke, banknotes and small money bags tumbling through the air, a large chunky 3D gold badge with circular arrows as the offer emblem. " +
      "COMPOSITION: the mascot occupies the upper-right, the 3D arrow badge sits lower-center as the anchor, the headline stacks on the left with a highlighted percentage tag. " +
      "LIGHTING: soft violet ambient glow, warm gold rim light on the badge and mascot, smoke catching the light. " +
      "TYPOGRAPHY & LAYOUT: bold condensed uppercase headline on the left, a small rounded tag for the number, everything inside the central safe zone. " +
      "COLOR: deep violet base with gold and one hot accent (max 3 dominant colors). " +
      "AVOID: real brand mascots, clutter, unreadable text, more than 3 dominant colors.",
  },
  {
    id: "preset48",
    fields: [FIELD_CASINO_PROP],
    name: "Крипто-казино: джентльмен",
    description: "Персона в смокинге с бокалом, синие светящиеся кольца, парящие стеклянные монеты",
    gradient: g("#020617", "#1d4ed8", "#38bdf8"),
    examples: ex("#020617", "#1d4ed8", "#0f172a", "#38bdf8"),
    isNew: true,
    template:
      "Create a premium crypto-casino banner for {SUBJECT}. " +
      "STYLE: a suave non-identifiable person in a black tuxedo and bow tie raising a coupe glass toward the camera, concentric glowing blue neon rings behind the head, translucent glass crypto-style tokens and gem shapes floating around, one large coin cropped in a lower corner. " +
      "COMPOSITION: centered hero figure from the waist up, the toast hand reaching forward in shallow depth of field, rings framing the head like a halo, headline in the upper-left, CTA lower-right. " +
      "LIGHTING: cool blue key light with hard rim highlights on the glass and lapels, dark vignette. " +
      "TYPOGRAPHY & LAYOUT: elegant bold sans headline, small caps subline, text within the safe zone away from the face. " +
      "COLOR: near-black navy with electric blue and a touch of champagne gold (max 3 dominant colors). " +
      "AVOID: real celebrity likeness, real coin logos, cluttered background.",
  },
  {
    id: "preset49",
    fields: [FIELD_BONUS_BADGE, FIELD_CASINO_PROP],
    name: "Депозит-бонус: маскот и карта %",
    description: "3D-персонаж в тематическом костюме, стеклянная карточка с процентом, инфо-полоса внизу",
    gradient: g("#04211f", "#0f766e", "#2dd4bf"),
    examples: ex("#04211f", "#0f766e", "#042f2e", "#2dd4bf"),
    isNew: true,
    template:
      "Create a deposit-bonus banner for {SUBJECT}. " +
      "STYLE: a friendly glossy 3D animated mascot in a themed costume (invented, non-branded) holding a gold coin, standing in a dim themed hall with gold coins on the floor and small glowing gems; a frosted-glass offer card with a big percentage and a hexagon icon floats on the left; a dark rounded info strip runs along the bottom. " +
      "COMPOSITION: mascot on the right two-thirds, the glass card and stacked headline on the left, the bottom strip full width. " +
      "LIGHTING: soft teal ambient light, warm gold highlights on the coin and costume trims, gentle sparkles. " +
      "TYPOGRAPHY & LAYOUT: two-line headline with one word bold and one light, a short subline, the percentage huge inside the glass card; all inside the safe zone. " +
      "COLOR: deep teal base with gold and a mint accent (max 3 dominant colors). " +
      "AVOID: real mascots, unreadable small text, more than 3 dominant colors.",
  },
  {
    id: "preset50",
    fields: [FIELD_BONUS_BADGE],
    name: "Фриспины: модель и промокод",
    description: "Вертикальный гигантский заголовок сбоку, персона в спортивном стиле, техно-плашка с кодом",
    gradient: g("#0a0a0a", "#ea580c", "#f97316"),
    examples: ex("#0a0a0a", "#ea580c", "#171717", "#f97316"),
    isNew: true,
    template:
      "Create a promo-code banner for {SUBJECT}. " +
      "STYLE: a stylish non-identifiable person in a sporty black-and-orange outfit with wraparound shades, posed on a pure black studio background; angular orange corner frames and small dotted tech marks; a large orange plate with chamfered corners holds the promo code. " +
      "COMPOSITION: a giant headline runs vertically along the left edge, the model fills the right half, the promo plate sits bottom-center overlapping the figure. " +
      "LIGHTING: crisp studio beauty light, glossy highlights, deep black shadows. " +
      "TYPOGRAPHY & LAYOUT: ultra-bold uppercase vertical headline, promo code in a rounded techno font on the plate; all text inside the safe zone. " +
      "COLOR: black with one vivid orange accent and white (max 3 dominant colors). " +
      "AVOID: real brand logos, real faces, cluttered background, more than 3 dominant colors.",
  },
  {
    id: "preset51",
    fields: [],
    name: "Маска-фишка (стрит-обложка)",
    description: "Одноцветный фон, фигура в глянцевой маске-фишке и стритвире, геометрический заголовок-глиф",
    gradient: g("#4a044e", "#a21caf", "#f97316"),
    examples: ex("#4a044e", "#a21caf", "#701a75", "#f97316"),
    isNew: true,
    template:
      "Create a streetwear-cover style casino banner for {SUBJECT}. STYLE: a single flat saturated magenta background, a bust-length figure in a hooded technical jacket and cap wearing a glossy surreal full-face mask shaped like an oversized casino chip with dice-pip eyes (invented design), bold geometric glyph-like headline lettering across the top, tiny micro-text blocks and a serial number in the corners, a few casino chips tucked into the jacket pocket. COMPOSITION: figure centered and cropped tight at the chest, headline glyphs spanning the top edge, micro-text blocks bottom-left and bottom-right. LIGHTING: soft even studio light, glossy specular highlights on the mask. TYPOGRAPHY & LAYOUT: heavy geometric display headline, tiny mono captions; keep every text inside the safe zone. COLOR: one flat background color, black garments, one contrasting accent (max 3 dominant colors). AVOID: gradients on the background, clutter, real logos.",
  },
  {
    id: "preset52",
    fields: [FIELD_WIN_CALLOUT],
    name: "Слот в каменных буквах",
    description: "Гигантские треснувшие 3D-буквы, персонаж развалился внутри, летящие обломки",
    gradient: g("#0a0a0a", "#be185d", "#f472b6"),
    examples: ex("#0a0a0a", "#be185d", "#1f0a14", "#f472b6"),
    isNew: true,
    template:
      "Create a monolithic-typography banner for {SUBJECT}. " +
      "STYLE: the headline rendered as giant cracked 3D stone letters filling the whole frame, chunks and debris flying outward with tiny glowing cracks, a laid-back 3D cartoon mascot character (invented, non-branded) lounging inside the letters wearing sunglasses. " +
      "COMPOSITION: letters stacked in two or three rows edge to edge, the mascot reclining across the middle row, debris scattered toward the corners. " +
      "LIGHTING: dramatic top light on the stone, glow bleeding from the cracks, black background. " +
      "TYPOGRAPHY & LAYOUT: the 3D letters ARE the headline (short, 2 words), a small CTA pill at the bottom inside the safe zone. " +
      "COLOR: black base with one saturated letter color and a lighter highlight of it (max 3 dominant colors). " +
      "AVOID: real cartoon characters, illegible letters, more than 3 dominant colors.",
  },
  {
    id: "preset53",
    fields: [],
    name: "Победитель в толпе",
    description: "Монохромная толпа игроков в шляпах, один герой в золотом с фишками, заголовок внизу",
    gradient: g("#0a0a0a", "#ea580c", "#262626"),
    examples: ex("#0a0a0a", "#ea580c", "#171717", "#f97316"),
    isNew: true,
    template:
      "Create a stand-out-from-the-crowd casino banner for {SUBJECT}. STYLE: a high-angle view of a dense crowd of identical figures in black suits and black fedoras rendered in near-monochrome around a casino floor, with one figure in the center dressed entirely in one vivid accent color tipping the hat and holding a tall stack of casino chips and an ace. COMPOSITION: the accent figure dead-center, the crowd fading into darkness toward the edges, headline stacked at the bottom with one giant word. LIGHTING: soft top light, deep black shadows, the accent figure slightly brighter. TYPOGRAPHY & LAYOUT: small intro line, one huge rounded bold word in the accent color, a clean subline; all inside the safe zone. COLOR: black, white and one accent color only. AVOID: recognizable faces, more than one accent color, clutter.",
  },
  {
    id: "preset54",
    fields: [FIELD_CASINO_PROP],
    name: "Барабан слота + большой шрифт",
    description: "Растянутые высокие буквы, светящийся 3D-барабан слота в центре, микро-ярлыки UI",
    gradient: g("#022c22", "#16a34a", "#4ade80"),
    examples: ex("#022c22", "#16a34a", "#052e16", "#4ade80"),
    isNew: true,
    template:
      "Create a kinetic-typography casino banner for {SUBJECT}. STYLE: two giant stretched, condensed white headline words with soft motion-blur ghosting, a glossy 3D golden slot-reel cylinder glowing with circuit-like light lines placed over the letters, lucky-7 and gem symbols on the reel, tiny UI-style labels, outline icons and small pill buttons around the edges. COMPOSITION: the two words stacked top and bottom filling the frame width, the 3D reel centered overlapping both, a spin-style pill CTA bottom-right, small labels along the top. LIGHTING: dark base with a colored glow behind the reel, white letters catching a slight edge glow. TYPOGRAPHY & LAYOUT: ultra-tall condensed headline, tiny sans captions, one pill CTA; keep the safe zone clean. COLOR: black-green base, white type, one neon accent (max 3 dominant colors). AVOID: unreadable stretched letters, clutter, more than 3 dominant colors.",
  },
  {
    id: "preset55",
    fields: [FIELD_SPORT, FIELD_MATCH_MOMENT],
    name: "Атлет + гигантские слова",
    description: "Гигантские жёлтые слова за атлетом, купон ставки и тег коэффициента, тёмная арена",
    gradient: g("#0a0a0a", "#eab308", "#facc15"),
    examples: ex("#0a0a0a", "#eab308", "#171717", "#facc15"),
    isNew: true,
    template:
      "Create a sportsbook poster banner for {SUBJECT}. STYLE: a dynamic non-identifiable athlete in dark training gear standing in front of two giant condensed yellow headline words, a dark moody arena behind, a glowing bet-slip ticket and a small odds tag floating beside the figure, a few pieces of sports gear blurred at the edges. COMPOSITION: athlete centered overlapping the giant words, a wide letter-spaced intro line above, the bet slip and odds tag beside the figure, a letter-spaced tagline at the bottom. LIGHTING: hard rim light on the body, dark background, yellow letters flat and bright. TYPOGRAPHY & LAYOUT: condensed uppercase giant words, wide tracked small caps captions; all inside the safe zone. COLOR: black, yellow and white only. AVOID: real athletes, real logos, more than 3 dominant colors.",
  },
  {
    id: "preset56",
    fields: [],
    name: "Игрок с картами (лукбук)",
    description: "Низкий ракурс, игрок с веером карт, гранжевые надписи по бокам, стикеры",
    gradient: g("#0a0a0a", "#dc2626", "#e5e5e5"),
    examples: ex("#0a0a0a", "#dc2626", "#171717", "#f5f5f5"),
    isNew: true,
    template:
      "Create a streetwear lookbook casino banner for {SUBJECT}. STYLE: extreme low-angle wide shot of a non-identifiable person in a bold colored bomber jacket and white sneakers standing on an escalator into a casino, fanning a hand of playing cards toward the camera with casino chips in the other hand, distressed grunge headline words painted on the walls left and right, small sticker labels, globe icons, arrows and a page-number tag. COMPOSITION: figure centered looking down at the camera, headline split into two stacks on either side, small labels top-left and bottom-right. LIGHTING: cold overhead strip lights with a warm casino glow below, high contrast, slight grain. TYPOGRAPHY & LAYOUT: distressed condensed uppercase, micro captions, sticker tags; keep the center safe zone readable. COLOR: black and white with one strong accent color (max 3 dominant colors). AVOID: real brand logos, recognizable faces, clutter in the safe zone.",
  },
  {
    id: "preset57",
    fields: [FIELD_BONUS_BADGE],
    name: "Кости в цепях (гранж-флаер)",
    description: "Чёрно-кислотный флаер, пушистые 3D-кости с цепями и шипами, рваные полосы",
    gradient: g("#0a0a0a", "#65a30d", "#a3e635"),
    examples: ex("#0a0a0a", "#65a30d", "#1a2e05", "#a3e635"),
    isNew: true,
    template:
      "Create a grunge casino-flyer banner for {SUBJECT}. STYLE: scratched black photocopy texture, a pair of fuzzy acid-green 3D dice decorated with chrome chains, spikes, a smiley pin and a barcode sticker as the hero, a few casino chips scattered, torn-paper strips carrying the offer lines, small lightning sparks. COMPOSITION: hero dice centered, headline in a distressed condensed font at the top, torn white and green offer strips stacked at the bottom-left. LIGHTING: flat flash-lit look, harsh contrast, heavy grain. TYPOGRAPHY & LAYOUT: distressed uppercase headline, offer lines on torn strips; all inside the safe zone. COLOR: black, white and acid green only. AVOID: clean gradients, more than 3 dominant colors, unreadable text.",
  },
  {
    id: "preset58",
    fields: [],
    name: "Маскот из бисера с фишкой",
    description: "Плоский жёлтый фон, маскот из бисера с фишкой и костями, чёрная типографика",
    gradient: g("#f59e0b", "#fbbf24", "#0a0a0a"),
    examples: ex("#f59e0b", "#fbbf24", "#d97706", "#0a0a0a"),
    isNew: true,
    template:
      "Create a craft-textured casino mascot banner for {SUBJECT}. STYLE: a flat solid yellow background, a playful 3D animal mascot (invented, non-branded) entirely made of colorful beads and knitted texture, wearing sunglasses and holding a beaded casino chip in one hand and a pair of beaded dice in the other, small hand-drawn accent strokes. COMPOSITION: mascot on the right two-thirds, a stacked headline top-left mixing bold sans and a script word, a short tagline block bottom-left. LIGHTING: soft even studio light, tiny specular sparkles on the beads. TYPOGRAPHY & LAYOUT: black bold sans headline with one script word, small letter-spaced captions; all inside the safe zone. COLOR: flat yellow base, black type, multicolor beads as texture only (max 3 dominant colors). AVOID: gradients on the background, real cartoon characters, clutter.",
  },
  {
    id: "preset59",
    fields: [FIELD_SPORT, FIELD_TIME_OF_DAY],
    name: "Матч из телефона (AR)",
    description: "Телефон в руке, из экрана вырываются мяч, кубок и форма, стадион и бейджи сторов",
    gradient: g("#0f172a", "#16a34a", "#dc2626"),
    examples: ex("#0f172a", "#16a34a", "#1e293b", "#dc2626"),
    isNew: true,
    template:
      "Create a mobile-app sports banner for {SUBJECT}. " +
      "STYLE: a hand holding a smartphone toward the camera, a miniature sports field on the screen with 3D props (ball, trophy, kit) bursting out of the screen in augmented-reality style, a floodlit stadium with crowd bokeh behind, app-store style download badges near the top. " +
      "COMPOSITION: phone centered-low, props popping upward, logo/headline zone at the top, tagline lines at the bottom-right. " +
      "LIGHTING: stadium floodlights with lens flares, green glow from the screen, cinematic haze. " +
      "TYPOGRAPHY & LAYOUT: bold italic uppercase headline, two download badges, all within the safe zone. " +
      "COLOR: dark navy base, pitch green and one warm accent (max 3 dominant colors). " +
      "AVOID: real team logos, real players, clutter around the phone.",
  },
  {
    id: "preset60",
    fields: [],
    name: "Анонс: мегафон на сукне",
    description: "Вид сверху, персона с мегафоном на красном сукне стола с разметкой и фишками",
    gradient: g("#7f1d1d", "#dc2626", "#fee2e2"),
    examples: ex("#7f1d1d", "#dc2626", "#991b1b", "#fee2e2"),
    isNew: true,
    template:
      "Create a bold casino announcement banner for {SUBJECT}. STYLE: a straight top-down bird's-eye photo of a non-identifiable person shouting into a large megaphone, standing on a textured solid red casino-table felt with painted white betting-box markings, a few casino chips and two playing cards lying on the felt, small motion lines from the megaphone. COMPOSITION: figure in the lower-left, a big condensed white headline in three stacked lines on the right, small logo zone top-right, URL line at the bottom. LIGHTING: hard light from above, sharp shadow, rich felt texture. TYPOGRAPHY & LAYOUT: condensed uppercase white headline slightly rotated, tiny footer; all inside the safe zone. COLOR: red, white and black only. AVOID: gradients, faces visible, clutter.",
  },
  {
    id: "preset61",
    fields: [FIELD_CASINO_PROP],
    name: "Хром-кости в цветах (люкс)",
    description: "Тёмно-красный шёлк, хромированные кости и фишка в гнезде из листвы и цветов",
    gradient: g("#450a0a", "#991b1b", "#84cc16"),
    examples: ex("#450a0a", "#991b1b", "#7f1d1d", "#a3e635"),
    isNew: true,
    template:
      "Create a surreal botanical luxury casino banner for {SUBJECT}. STYLE: a deep red silk-draped backdrop, a cluster of glossy chrome 3D dice and one chrome casino chip nested in a lush arrangement of real leaves, white flowers and sprigs, more foliage rising from the bottom edge. COMPOSITION: chrome dice centered inside the foliage, a wide letter-spaced headline in two lines at the top, small date-style labels on the left and right edges, a featured line in a boxed label near the bottom. LIGHTING: soft moody studio light, chrome reflections, rich shadows in the leaves. TYPOGRAPHY & LAYOUT: extended geometric uppercase headline in cream, small tags; all inside the safe zone. COLOR: dark red base, green foliage, cream text (max 3 dominant colors). AVOID: clutter, unreadable text, more than 3 dominant colors.",
  },
  {
    id: "preset62",
    fields: [],
    name: "Ночной стол под лампой",
    description: "Тёмная сцена, гибкая лампа подсвечивает заголовок, фишки и карта на столе",
    gradient: g("#1a1a0f", "#3f3f1a", "#f97316"),
    examples: ex("#1a1a0f", "#3f3f1a", "#262614", "#f97316"),
    isNew: true,
    template:
      "Create a minimalist spotlight casino banner for {SUBJECT}. STYLE: a dark green felt surface, a single flexible gooseneck desk lamp with a warm bulb photographed from above, its light pool illuminating the headline words printed flat on the felt plus a small stack of casino chips and one face-down playing card; everything else stays in shadow. COMPOSITION: lamp head top-right shining down-left, the headline stacked diagonally under the light, chips and the card at the edge of the pool, small logo top-center, CTA line bottom-right. LIGHTING: one warm practical light source, soft falloff, deep shadows. TYPOGRAPHY & LAYOUT: bold uppercase headline in a warm accent, tiny footer; all inside the safe zone. COLOR: dark green, warm orange, white (max 3 dominant colors). AVOID: clutter, flat even lighting, more than 3 dominant colors.",
  },
  {
    id: "preset63",
    fields: [FIELD_BONUS_BADGE, FIELD_CASINO_PROP],
    name: "Бонус 100%: король-маскот",
    description: "Двухцветный градиент, 3D-маскот с короной, огромный процент, летящие купюры",
    gradient: g("#1e3a8a", "#6d28d9", "#dc2626"),
    examples: ex("#1e3a8a", "#6d28d9", "#1d4ed8", "#dc2626"),
    isNew: true,
    template:
      "Create a first-deposit bonus banner for {SUBJECT}. " +
      "STYLE: a bold two-tone diagonal gradient background (cool on the left, warm on the right), a large friendly 3D animated king mascot (invented, non-branded) with a jeweled crown and big moustache smiling at the camera, banknotes flying in from the sides, blurred slot machines behind. " +
      "COMPOSITION: mascot head-and-shoulders on the right, a giant bold percentage bottom-left, headline in two lines under it, short subline. " +
      "LIGHTING: bright saturated key light, glossy highlights on the crown, soft depth blur. " +
      "TYPOGRAPHY & LAYOUT: giant rounded bold number with a small % sign, cream uppercase headline, all inside the safe zone. " +
      "COLOR: blue-to-red gradient with cream/white text and gold (max 3 dominant colors). " +
      "AVOID: real mascots, unreadable text, more than 3 dominant colors.",
  },
  {
    id: "preset64",
    fields: [],
    name: "Обложка: статуя с фишкой",
    description: "Обложка журнала: хром-заголовок, фигура-статуя с фишкой, неоновое кольцо, хром-кости",
    gradient: g("#0a0a0a", "#7e22ce", "#c084fc"),
    examples: ex("#0a0a0a", "#7e22ce", "#171717", "#c084fc"),
    isNew: true,
    template:
      "Create a magazine-cover style casino banner for {SUBJECT}. STYLE: a giant chrome 3D masthead word across the top, a monochrome sculpted statue-like figure in a glossy puffer jacket and black sunglasses marked with neon X's holding a chrome casino chip between two fingers, a glowing neon ring behind the head, floating chrome dice and chips, brush-script slogan lines in neon. COMPOSITION: figure centered bust-length, masthead behind the head, small caption columns on both sides, brush-script slogan across the bottom, a small advisory-style label tag bottom-right. LIGHTING: cool studio light with neon rim glow, black background. TYPOGRAPHY & LAYOUT: chrome display masthead, small caps captions, brush script accent; keep the safe zone readable. COLOR: black, chrome-white and one neon accent (max 3 dominant colors). AVOID: recognizable faces, real magazine names, clutter.",
  },
  {
    id: "preset65",
    fields: [FIELD_SPORT, FIELD_BONUS_BADGE],
    name: "Промокод: хром-трофей и мячи",
    description: "Хромированный кубок, знаки $, мячи и купюры из телефона, синие ленты, поле промокода",
    gradient: g("#0f172a", "#2563eb", "#e2e8f0"),
    examples: ex("#0f172a", "#2563eb", "#1e293b", "#e2e8f0"),
    isNew: true,
    template:
      "Create a sports-betting promo banner for {SUBJECT}. " +
      "STYLE: chrome 3D props (a trophy cup, dollar signs, balls, a stack of banknotes) bursting out of a dark phone silhouette, a floodlit stadium pitch behind, angled blue ribbon plates above and below the headline, a frosted promo-code field and a row of four small benefit captions along the bottom. " +
      "COMPOSITION: props clustered center, huge white condensed headline across the middle, ribbon plates angled slightly, promo field and benefits row at the bottom. " +
      "LIGHTING: stadium floodlights, chrome reflections, cool blue glow. " +
      "TYPOGRAPHY & LAYOUT: heavy condensed uppercase headline, small caps benefits, all inside the safe zone. " +
      "COLOR: navy, chrome-white and electric blue (max 3 dominant colors). " +
      "AVOID: real logos, unreadable small text, clutter.",
  },
  {
    id: "preset66",
    fields: [FIELD_CASINO_PROP, FIELD_BONUS_BADGE],
    name: "Хостес и золотые карты",
    description: "Тёмные соты, золотые карты, смеющаяся модель в блестящем платье, оранжевый заголовок",
    gradient: g("#0a0a0a", "#b45309", "#fbbf24"),
    examples: ex("#0a0a0a", "#b45309", "#171717", "#fbbf24"),
    isNew: true,
    template:
      "Create a classic casino promo banner for {SUBJECT}. " +
      "STYLE: a dark hexagonal-pattern background, glowing gold playing cards and confetti, a laughing non-identifiable model in a sparkling sequin dress on the right, a bold orange headline block on the left with an offer amount in a rounded label and a red CTA pill. " +
      "COMPOSITION: model on the right half, text stack on the left, contact strip along the bottom. " +
      "LIGHTING: warm gold spotlights, sparkle highlights, dark vignette. " +
      "TYPOGRAPHY & LAYOUT: chunky orange uppercase headline, an offer line, a red CTA pill; all inside the safe zone. " +
      "COLOR: black, gold-orange and red (max 3 dominant colors). " +
      "AVOID: recognizable faces, clutter, more than 3 dominant colors.",
  },
  {
    id: "preset67",
    fields: [],
    name: "Черепаха с фишками (юмор)",
    description: "Плоский жёлтый фон, черепаха на скейте везёт стопку фишек с ракетой, пунктирные стрелки",
    gradient: g("#eab308", "#facc15", "#0a0a0a"),
    examples: ex("#eab308", "#facc15", "#ca8a04", "#0a0a0a"),
    isNew: true,
    template:
      "Create a witty surreal-object casino banner for {SUBJECT}. STYLE: a flat solid yellow background, a humorous photoreal assembly: a slow tortoise riding a skateboard with a tall stack of casino chips and a pair of dice strapped on its shell and a toy rocket tied behind, casting a soft shadow, hand-drawn dotted arrows and a halftone dot patch as decoration. COMPOSITION: the object assembly centered-low, a two-line headline centered above with one word bold, a small subline, a row of three small icon captions at the bottom. LIGHTING: clean studio light, soft ground shadow. TYPOGRAPHY & LAYOUT: black mixed-weight sans headline, small icon labels; all inside the safe zone. COLOR: yellow, black and one metallic object tone (max 3 dominant colors). AVOID: gradients on the background, clutter, real logos.",
  },
  {
    id: "preset68",
    fields: [],
    name: "Джекпот: разбитое стекло",
    description: "Жёлтая гигантская типографика взрывается осколками и фишками, ночной город",
    gradient: g("#0a0a0a", "#ca8a04", "#facc15"),
    examples: ex("#0a0a0a", "#ca8a04", "#171717", "#facc15"),
    isNew: true,
    template:
      "Create a shattered-typography casino banner for {SUBJECT}. STYLE: giant condensed yellow headline letters exploding into glass shards, casino chips and lucky-7 fragments from a central impact point, a dark city skyline and brick wall behind, a silhouetted non-identifiable figure in a hoodie tossing a handful of chips into the air. COMPOSITION: the headline fills the frame diagonally, impact point center, offer details in small blocks at the corners, a footer strip with a QR-style tile bottom-right. LIGHTING: hard black-and-yellow contrast, streaks of light from the impact. TYPOGRAPHY & LAYOUT: condensed uppercase giant headline, small caps details; keep the safe zone readable. COLOR: black, yellow and white only. AVOID: real event names, recognizable faces, more than 3 dominant colors.",
  },
  {
    id: "preset69",
    fields: [],
    name: "Ракета на монетах",
    description: "Золотая 3D-ракета с шлейфом из монет и фишек на чёрно-оранжевом градиенте",
    gradient: g("#0a0a0a", "#c2410c", "#f97316"),
    examples: ex("#0a0a0a", "#c2410c", "#1c1917", "#f97316"),
    isNew: true,
    template:
      "Create a launch-themed casino banner for {SUBJECT}. STYLE: a single glossy gold-and-orange 3D retro rocket angled upward with chrome trim, its exhaust plume made of flying gold coins, casino chips and sparks, on a black-to-orange radial gradient background; nothing else in the scene. COMPOSITION: rocket in the right two-thirds rising diagonally, a three-line headline top-left with the middle word in the accent color, logo zone above it, a CTA strip at the bottom. LIGHTING: warm rim light from below, glossy reflections, soft glow in the coin plume. TYPOGRAPHY & LAYOUT: bold rounded sans headline mixing white and accent, small footer; all inside the safe zone. COLOR: black, orange-gold and white only. AVOID: clutter, extra props, more than 3 dominant colors.",
  },
  {
    id: "preset70",
    fields: [],
    name: "Карты и фишки (ч/б коллаж)",
    description: "Ч/б редакторский коллаж: диагональные фото игрока, веер карт и фишки, скотч-заметки",
    gradient: g("#e7e5e4", "#1c1917", "#a8a29e"),
    examples: ex("#e7e5e4", "#1c1917", "#d6d3d1", "#78716c"),
    isNew: true,
    template:
      "Create an editorial collage casino banner for {SUBJECT}. STYLE: off-white paper background, black-and-white photo panels of a non-identifiable player in sunglasses at a card table sliced into steep diagonal strips, a close-up of a fanned deck of cards and stacked chips at the bottom-right, paint splatter, tape-stuck paper notes, crosshair and dotted marks, a row of three outline benefit icons with captions along the bottom. COMPOSITION: headline stacked top-left with one script word, photo strips through the center, cards and chips bottom-right, benefits row along the bottom edge. LIGHTING: flat print-like contrast, subtle paper grain. TYPOGRAPHY & LAYOUT: condensed uppercase headline plus a script accent word, letter-spaced micro captions; keep the safe zone readable. COLOR: black, off-white and one muted accent (max 3 dominant colors). AVOID: recognizable faces, real logos, clutter in the center.",
  },
  {
    id: "preset71",
    fields: [FIELD_SPORT, FIELD_BONUS_BADGE],
    name: "Бонус 15%: атлет и HUD-сетка",
    description: "Портрет атлета в профиль на фоне неоновой сетки стадиона, огромный процент бонуса",
    gradient: g("#022c22", "#059669", "#4ade80"),
    examples: ex("#022c22", "#059669", "#064e3b", "#4ade80"),
    isNew: true,
    template:
      "Create a sports deposit-bonus banner for {SUBJECT}. " +
      "STYLE: a non-identifiable athlete in a plain kit shown in profile from the chest up, a glowing green perspective grid and HUD lines over a dark stadium, a ball entering from the lower-left, a giant bold percentage with a highlighted word plate under it. " +
      "COMPOSITION: athlete upper half, percentage and headline stacked in the lower half, a small info line and a footer strip with social icons at the bottom. " +
      "LIGHTING: teal ambient light, green neon glow on the grid, warm rim on the athlete. " +
      "TYPOGRAPHY & LAYOUT: giant white number, a green filled plate word, bold white headline, small caption; all inside the safe zone. " +
      "COLOR: dark teal, neon green and white (max 3 dominant colors). " +
      "AVOID: real players, real club kits or logos, clutter.",
  },
  {
    id: "preset72",
    fields: [FIELD_CASINO_PROP],
    name: "Гламур-маскот с картами",
    description: "Монохромный розовый, пушистый 3D-маскот в блёстках и цепях с веером карт и фишками",
    gradient: g("#831843", "#db2777", "#f9a8d4"),
    examples: ex("#831843", "#db2777", "#9d174d", "#f9a8d4"),
    isNew: true,
    template:
      "Create a glam casino mascot banner for {SUBJECT}. STYLE: an all-pink monochrome scene, a fluffy 3D animal mascot (invented, non-branded) in a sequined jacket, gold chains, rings and sunglasses fanning a hand of playing cards with gold casino chips stacked beside it, feathery pink bokeh and sparkles behind. COMPOSITION: mascot centered from the waist up, a big bold white headline word across the top, a small intro line above it, a pill CTA and a barcode-style detail at the bottom. LIGHTING: soft pink beauty light, glitter sparkle highlights on the jewelry. TYPOGRAPHY & LAYOUT: heavy condensed uppercase headline, tiny captions; all inside the safe zone. COLOR: pink shades, white and gold (max 3 dominant colors). AVOID: real cartoon characters, clutter, more than 3 dominant colors.",
  },
  {
    id: "preset73",
    fields: [FIELD_BONUS_BADGE, FIELD_CASINO_PROP],
    name: "Двойной оффер в венках",
    description: "Два оффера в лавровых венках, 3D-маскот указывает на зрителя, слот и бейджи",
    gradient: g("#0a0a0a", "#b91c1c", "#f59e0b"),
    examples: ex("#0a0a0a", "#b91c1c", "#1c1917", "#f59e0b"),
    isNew: true,
    template:
      "Create a double-offer casino banner for {SUBJECT}. " +
      "STYLE: two red laurel wreaths framing two offer percentages side by side under a rounded red title pill, a muscular 3D mythic mascot (invented, non-branded) in gold armor pointing at the viewer, a themed slot cabinet behind, winged gold multiplier badges and a small QR-style tile. " +
      "COMPOSITION: wreath offers top, mascot centered-low, badges at the sides, a row of tiny license icons along the bottom. " +
      "LIGHTING: warm gold spotlight on the mascot, dark smoky background. " +
      "TYPOGRAPHY & LAYOUT: bold red numbers with a small % sign, uppercase labels, a short validity line; all inside the safe zone. " +
      "COLOR: black, red and gold (max 3 dominant colors). " +
      "AVOID: real mascots or games, unreadable text, clutter.",
  },
  {
    id: "preset74",
    fields: [],
    name: "Портрет с очками-фишками",
    description: "Плоский жёлтый фон, портрет с серьгами-костями и очками-фишками, гигантские буквы позади",
    gradient: g("#facc15", "#eab308", "#1d4ed8"),
    examples: ex("#facc15", "#eab308", "#fde047", "#1d4ed8"),
    isNew: true,
    template:
      "Create a two-color pop portrait casino banner for {SUBJECT}. STYLE: a flat solid yellow background, a non-identifiable model in profile-to-camera wearing bold blue-and-yellow casino accessories (oversized sunglasses with casino-chip rims, dice-shaped earrings, a knitted headpiece), a giant white letter faintly behind the head. COMPOSITION: portrait centered, a two-word headline in huge blue rounded bold type at the top overlapping the head, tiny logo line top-left. LIGHTING: soft even studio light, glossy skin highlights. TYPOGRAPHY & LAYOUT: two-word headline only, huge and bold; keep it inside the safe zone. COLOR: yellow, blue and white only. AVOID: recognizable faces, gradients, more than 3 dominant colors.",
  },
  {
    id: "preset75",
    fields: [FIELD_BONUS_BADGE],
    name: "Кислотный маскот с фишками",
    description: "Ядовито-зелёный монохром, 3D-персонаж с фишками, объёмный bubble-заголовок, стикер",
    gradient: g("#052e16", "#16a34a", "#84cc16"),
    examples: ex("#052e16", "#16a34a", "#14532d", "#84cc16"),
    isNew: true,
    template:
      "Create an acid-green casino party banner for {SUBJECT}. STYLE: a fully green monochrome scene with fog and light streaks, a glossy 3D cartoon character (invented, non-branded) in a cap and mirrored shades blowing a bubble-gum bubble and holding a fan of casino chips, floating dice and chips at the edges, a chunky glossy 3D bubble-letter headline, a round sticker badge with offer text. COMPOSITION: character bust centered-top, bubble headline lower-center, sticker badge on the upper-left, a script subline and small details at the bottom. LIGHTING: green neon glow, glossy specular highlights, slight VHS grain. TYPOGRAPHY & LAYOUT: inflated bubble letters, a round sticker, small caps and a script line; all inside the safe zone. COLOR: green shades, black and white only. AVOID: real characters, more than 3 dominant colors, clutter.",
  },
  {
    id: "preset76",
    fields: [FIELD_SPORT],
    name: "Надувные буквы вокруг атлета",
    description: "Огромные надувные буквы обвивают атлета с телефоном на корте, солнечный день",
    gradient: g("#65a30d", "#a3e635", "#38bdf8"),
    examples: ex("#65a30d", "#a3e635", "#4d7c0f", "#38bdf8"),
    isNew: true,
    template:
      "Create an inflatable-typography sportsbook banner for {SUBJECT}. STYLE: giant puffy inflatable 3D letters in a green-to-teal gradient spiraling around a non-identifiable athletic person on a sunny sports court holding sports gear in one hand and a phone showing a bet slip in the other, the letters physically wrapping the body, palm trees and blue sky behind, a small odds tag. COMPOSITION: person centered, the two headline words inflated above and below wrapping around them, the odds tag near the phone, small logo tags in the bottom corners. LIGHTING: bright natural sunlight, soft shadows on the inflatable surfaces. TYPOGRAPHY & LAYOUT: the inflatable letters ARE the headline (two short words); minimal other text inside the safe zone. COLOR: lime-green, teal and sky blue (max 3 dominant colors). AVOID: recognizable faces, real logos, unreadable letters.",
  },
  {
    id: "preset77",
    fields: [],
    name: "Модель на золотой фишке",
    description: "Модель сидит на гигантской золотой фишке, брызги монет и самоцветов, рукописный заголовок",
    gradient: g("#14532d", "#16a34a", "#fde047"),
    examples: ex("#14532d", "#16a34a", "#166534", "#fde047"),
    isNew: true,
    template:
      "Create a coin-splash casino banner for {SUBJECT}. STYLE: a giant photoreal gold casino chip lying tilted with a non-identifiable model in a matching colorful outfit sitting on top of it, gold coins, gems and dice flying around with a big liquid-gold splash, a small 3D cloud accent. COMPOSITION: chip and model centered-low, a two-line distressed headline in the upper-left, coins in the corners. LIGHTING: bright saturated studio light, glossy highlights, vivid green gradient backdrop. TYPOGRAPHY & LAYOUT: hand-stamped distressed uppercase headline, one word in the accent color; all inside the safe zone. COLOR: green, gold and white (max 3 dominant colors). AVOID: real brand logos, recognizable faces, clutter.",
  },
  {
    id: "preset78",
    fields: [FIELD_CASINO_PROP],
    name: "Семёрка в неон-дрипе",
    description: "Стекающий неоновый заголовок, светящаяся 3D-семёрка в шляпе, фиолетовый туман",
    gradient: g("#2e1065", "#7e22ce", "#f97316"),
    examples: ex("#2e1065", "#7e22ce", "#3b0764", "#f97316"),
    isNew: true,
    template:
      "Create a neon-drip casino banner for {SUBJECT}. STYLE: a violet fog-filled night scene, the headline in dripping neon-tube letters with an orange inner glow, a glowing 3D lucky-7 slot symbol wearing an oversized hat as the centerpiece with gold coins around it, dark silhouettes and bare tree branches faintly behind. COMPOSITION: dripping headline top-center, hero object centered-low, a script subline and small detail lines at the bottom. LIGHTING: purple ambient glow, orange light from the hero object, neon bloom on the letters. TYPOGRAPHY & LAYOUT: dripping display headline, elegant script subline, small caps details; all inside the safe zone. COLOR: violet, orange and white (max 3 dominant colors). AVOID: real event names, clutter, unreadable drips.",
  },
  {
    id: "preset79",
    fields: [FIELD_SPORT, FIELD_JACKPOT_TIER],
    name: "Спорт-джекпот: фанат и монеты",
    description: "Золотой 3D-заголовок в рамке, кричащий фанат, парящий инвентарь и монеты",
    gradient: g("#052e16", "#16a34a", "#fbbf24"),
    examples: ex("#052e16", "#16a34a", "#14532d", "#fbbf24"),
    isNew: true,
    template:
      "Create a sports-jackpot banner for {SUBJECT}. " +
      "STYLE: a green-lit stadium interior, a shiny gold 3D headline inside a thin gold rounded frame, a euphoric non-identifiable fan in a green hoodie screaming with fists clenched, assorted sports gear (skate, helmet, racket, balls) and gold coins floating around. " +
      "COMPOSITION: prize amount and headline stacked at the top, the gold 3D title plate centered, the fan bust at the bottom-center, gear in the corners. " +
      "LIGHTING: green arena glow, gold reflections, floodlight flares. " +
      "TYPOGRAPHY & LAYOUT: big green prize figure, white bold subline, gold 3D title; all inside the safe zone. " +
      "COLOR: green, gold and white (max 3 dominant colors). " +
      "AVOID: real logos, recognizable faces, clutter in the safe zone.",
  },
  {
    id: "preset80",
    fields: [],
    name: "Машина-приз (граффити)",
    description: "Ч/б фото машины-приза, неоново-розовые и лаймовые граффити, фишки, мятая бумага",
    gradient: g("#0a0a0a", "#db2777", "#a3e635"),
    examples: ex("#0a0a0a", "#db2777", "#171717", "#a3e635"),
    isNew: true,
    template:
      "Create a street-zine casino banner for {SUBJECT}. STYLE: crumpled black paper texture, a black-and-white photo of a sleek sports-car prize on a wet reflective casino-garage floor with casino chips scattered around the wheels, a stacked headline mixing a white block word, a lime plate word and a pink spray-paint script word, spray drips, tiny checklists and label tags in the corners. COMPOSITION: headline stack top-center, car lower-center, chips in the foreground, micro labels in the corners. LIGHTING: high-contrast monochrome photo with neon pink highlight streaks. TYPOGRAPHY & LAYOUT: condensed block uppercase, spray script, micro captions; keep the safe zone readable. COLOR: black/white, neon pink and lime (max 3 dominant colors). AVOID: real car brands or logos, clutter in the safe zone.",
  },
  {
    id: "preset81",
    fields: [FIELD_SPORT],
    name: "Приложение: фанат с телефоном",
    description: "Плоский фиолетовый фон, восторженный фанат с телефоном, карточки ставок на экране",
    gradient: g("#4c1d95", "#7c3aed", "#facc15"),
    examples: ex("#4c1d95", "#7c3aed", "#5b21b6", "#facc15"),
    isNew: true,
    template:
      "Create a mobile-app showcase banner for {SUBJECT}. " +
      "STYLE: a flat solid purple background, a joyful non-identifiable person in playful goggles laughing and pointing at a smartphone they hold up to the camera, a generic app UI on the screen with a highlighted stat card, a large tilted tablet with more UI cards cropped at the right edge, a sports ball in the corner. " +
      "COMPOSITION: person center-right, phone in the left hand toward the camera, a two-line bold white headline with one highlighted yellow word at the top, small logo above. " +
      "LIGHTING: bright even studio light, glossy screen reflections. " +
      "TYPOGRAPHY & LAYOUT: extra-bold uppercase headline, generic UI text on screens; all inside the safe zone. " +
      "COLOR: purple, white and yellow (max 3 dominant colors). " +
      "AVOID: real app names or players, recognizable faces, clutter.",
  },
  {
    id: "preset82",
    fields: [FIELD_SPORT, FIELD_MATCH_MOMENT],
    name: "Дуотон-экшн: бег на камеру",
    description: "Красно-белый дуотон, гигантская надпись, атлеты бегут на камеру, тег коэффициента",
    gradient: g("#7f1d1d", "#dc2626", "#fafafa"),
    examples: ex("#7f1d1d", "#dc2626", "#991b1b", "#fafafa"),
    isNew: true,
    template:
      "Create a red-duotone sportsbook action banner for {SUBJECT}. STYLE: a bold red-and-white duotone poster: a giant white headline word fills the background, three non-identifiable athletes in helmets and gear sprinting toward the camera across a wet street, white speed streaks, a dark city skyline silhouette, a small boxed odds tag and event title top-right. COMPOSITION: lead figure reaching toward the lens on the left, others behind on the right, giant word behind everything, small label block top-right. LIGHTING: hard graphic contrast, wet reflections, grain. TYPOGRAPHY & LAYOUT: giant condensed white word as backdrop, small caps label; keep the safe zone readable. COLOR: red, white and black only. AVOID: recognizable faces, real logos, more than 3 dominant colors.",
  },
  {
    id: "preset83",
    fields: [],
    name: "Дротик в рулетку",
    description: "Светящийся 3D-дротик в центре мишени-рулетки на чёрном, минимальный жёлтый заголовок",
    gradient: g("#0a0a0a", "#a16207", "#facc15"),
    examples: ex("#0a0a0a", "#a16207", "#171717", "#facc15"),
    isNew: true,
    template:
      "Create a precision-target casino banner for {SUBJECT}. STYLE: a black scene with a glowing yellow 3D dart striking the center of a large concentric target styled as a roulette wheel (numbered pockets, yellow-and-black segments) seen at an angle, a few casino chips resting on the rim; nothing else. COMPOSITION: wheel fills the lower-left, dart angled from the upper-right, headline and a short two-line subline top-left, small logo top-right. LIGHTING: the dart and rings emit the only light, soft glow on the black surface. TYPOGRAPHY & LAYOUT: bold yellow serif-sans headline, white subline; all inside the safe zone. COLOR: black, yellow and white only. AVOID: clutter, extra props, more than 3 dominant colors.",
  },
  {
    id: "preset84",
    fields: [],
    name: "Портрет с фишкой + буквы",
    description: "Гигантские жёлтые буквы поверх портрета с золотой фишкой, розовый фон",
    gradient: g("#f472b6", "#ec4899", "#fde047"),
    examples: ex("#f472b6", "#ec4899", "#f9a8d4", "#fde047"),
    isNew: true,
    template:
      "Create a typography-over-portrait casino banner for {SUBJECT}. STYLE: a flat pink background, a frontal non-identifiable portrait with a bright pastel-yellow outfit holding a gold casino chip up beside the face, a giant yellow headline broken into stacked words overlapping the face and body, small justified caption columns in the top corners. COMPOSITION: portrait centered, headline words staggered left and right down the frame, micro captions top-left and top-right, tiny footer bottom-left. LIGHTING: flat even fashion light, pastel tones. TYPOGRAPHY & LAYOUT: huge grotesque bold words, tiny caption columns; keep the headline readable inside the safe zone. COLOR: pink, yellow and white only. AVOID: recognizable faces, gradients, more than 3 dominant colors.",
  },
  {
    id: "preset85",
    fields: [FIELD_BONUS_BADGE, FIELD_CASINO_PROP],
    name: "Бонус: два маскота-босса",
    description: "Тёмно-зелёный фон, два 3D-маскота в золоте и очках, огромный процент и плашка",
    gradient: g("#022c22", "#065f46", "#34d399"),
    examples: ex("#022c22", "#065f46", "#064e3b", "#34d399"),
    isNew: true,
    template:
      "Create a high-roller bonus banner for {SUBJECT}. " +
      "STYLE: a dark green background with faint concentric line patterns, two flashy 3D cartoon mascots (invented, non-branded) in gold-embroidered jackets, chains, rings and sunglasses, one fanning banknotes; a giant green gradient percentage with a small % tile, a filled plate under it, a footer bar with small social handles and a CTA chip. " +
      "COMPOSITION: percentage and word plate top-center, both mascots bust-height in the lower two-thirds, footer strip along the bottom. " +
      "LIGHTING: warm gold highlights, cool green ambient, glossy 3D shading. " +
      "TYPOGRAPHY & LAYOUT: giant rounded number, uppercase plate word, tiny footer; all inside the safe zone. " +
      "COLOR: dark green, gold and mint (max 3 dominant colors). " +
      "AVOID: real mascots, clutter, unreadable footer.",
  },
  {
    id: "preset86",
    fields: [FIELD_SPORT, FIELD_BONUS_BADGE],
    name: "Фрибет: хайп и бейджи сторов",
    description: "Синий свет, восторженный человек, серебряный 3D-заголовок, жёлтая линия, бейджи сторов",
    gradient: g("#0c1a3a", "#1e40af", "#facc15"),
    examples: ex("#0c1a3a", "#1e40af", "#172554", "#facc15"),
    isNew: true,
    template:
      "Create a free-bet hype banner for {SUBJECT}. " +
      "STYLE: a blue studio light-beam backdrop, an ecstatic non-identifiable person in a denim jacket mid-jump waving a yellow scarf and holding yellow glasses, banknotes flying at the edges; a chunky silver 3D headline with a yellow hand-drawn underline, a pill label above it, app-store style badges and a footer bar with a URL. " +
      "COMPOSITION: person right half, text stack left, badges bottom-left, footer strip along the bottom. " +
      "LIGHTING: cool blue beams from behind, bright fill on the subject, sparkle highlights. " +
      "TYPOGRAPHY & LAYOUT: bold silver-white headline, a short line with one yellow word, small badges; all inside the safe zone. " +
      "COLOR: blue, yellow and white (max 3 dominant colors). " +
      "AVOID: recognizable faces, real logos, clutter.",
  },
  {
    id: "preset87",
    fields: [],
    name: "Тедди с костями (стрит)",
    description: "Векторная стрит-графика: залатанный плюш с золотой цепью и костями, белые контурные буквы",
    gradient: g("#0a0a0a", "#92400e", "#f5f5f5"),
    examples: ex("#0a0a0a", "#92400e", "#171717", "#f5f5f5"),
    isNew: true,
    template:
      "Create a streetwear tee-graphic casino banner for {SUBJECT}. STYLE: flat black background, a cel-shaded vector illustration of a patched-up plush toy mascot (invented) in torn streetwear with a thick gold chain holding a pair of dice and a casino chip, thick black outlines, big white outlined headline letters and paint drips behind it, small sticker phrases and crossed-out marks in the corners. COMPOSITION: mascot centered full-body, headline letters behind it, small caption phrases top-left/top-right, a two-line tagline in white along the bottom. LIGHTING: flat vector shading, no photographic light. TYPOGRAPHY & LAYOUT: chunky outlined display letters, small brush captions; all inside the safe zone. COLOR: black, white and one warm accent (max 3 dominant colors). AVOID: real characters, photoreal rendering, clutter.",
  },
  {
    id: "preset88",
    fields: [],
    name: "Пушистый с костью (лайм)",
    description: "Чёрный верх, лаймовый низ с гигантским рукописным словом, пушистый персонаж с костями",
    gradient: g("#0a0a0a", "#65a30d", "#a3e635"),
    examples: ex("#0a0a0a", "#65a30d", "#171717", "#a3e635"),
    isNew: true,
    template:
      "Create a split-color casino banner for {SUBJECT}. STYLE: the frame split horizontally, black on top and flat lime green below, a non-identifiable figure covered in fuzzy lime-green fur wearing mirrored goggles and holding a glossy black die between two fingers, a thin white rounded rectangle frame around the figure, a giant white handwritten headline word across the lime bottom band. COMPOSITION: figure centered inside the thin frame, small serif labels in the frame corners, the handwritten word bleeding across the bottom third. LIGHTING: crisp studio light, orange-red reflection of a roulette wheel in the goggles as the only warm note. TYPOGRAPHY & LAYOUT: giant brush-marker script headline, tiny serif captions; keep the safe zone clean. COLOR: black, lime green and white (max 3 dominant colors). AVOID: recognizable faces, real logos, clutter.",
  },
  {
    id: "preset89",
    fields: [],
    name: "Бонус истекает: часы с монетами",
    description: "Песочные часы с сыплющимися золотыми монетами на чёрном, фишки и карты в тени",
    gradient: g("#0a0a0a", "#c2410c", "#fb923c"),
    examples: ex("#0a0a0a", "#c2410c", "#1c1917", "#fb923c"),
    isNew: true,
    template:
      "Create a bonus-countdown casino banner for {SUBJECT}. STYLE: a black studio scene, a large glass-and-chrome hourglass filled with glowing gold coins pouring through the neck instead of sand as the hero, stacks of casino chips and two playing cards faintly lit in the background, glow reflections on the floor. COMPOSITION: hourglass center-left, a stacked headline top-right mixing white and gold words in different sizes, logo top-center, a CTA strip along the bottom. LIGHTING: the coins are the light source, warm rim on the chrome, everything else dark. TYPOGRAPHY & LAYOUT: bold grotesque headline in layered sizes, tiny footer; all inside the safe zone. COLOR: black, gold-orange and white only. AVOID: clutter, flat lighting, more than 3 dominant colors.",
  },
  {
    id: "preset90",
    fields: [],
    name: "Бонус запущен: белая ракета",
    description: "Белый фон, белая 3D-ракета с шлейфом из золотых монет и облаками, свуш-градиент",
    gradient: g("#ffffff", "#fb923c", "#f97316"),
    examples: ex("#ffffff", "#fb923c", "#fff7ed", "#f97316"),
    isNew: true,
    template:
      "Create a light-theme casino launch banner for {SUBJECT}. STYLE: a clean white background with a large orange swoosh curve, a glossy white 3D rocket with gold fins launching diagonally upward, its exhaust a bright plume of gold coins, casino chips and sparkles over fluffy orange-lit clouds at the bottom. COMPOSITION: rocket in the right half angled up, a two-line headline top-left with the second word in orange, a short subline and a small round badge below, logo zone above. LIGHTING: bright airy daylight, soft shadows, warm glow from the coin plume. TYPOGRAPHY & LAYOUT: rounded bold sans headline in dark grey and orange, small captions; all inside the safe zone. COLOR: white, orange-gold and dark grey only. AVOID: dark backgrounds, clutter, more than 3 dominant colors.",
  },
  {
    id: "preset91",
    fields: [FIELD_CASINO_PROP],
    name: "Маскот с картами (фиолет)",
    description: "Фиолетовый фон с сеткой, повторяющееся слово, 3D-маскот с веером карт, стеклянные плашки",
    gradient: g("#2e1065", "#6d28d9", "#dc2626"),
    examples: ex("#2e1065", "#6d28d9", "#4c1d95", "#dc2626"),
    isNew: true,
    template:
      "Create a casino promo banner for {SUBJECT}. STYLE: a deep purple background with a faint perspective grid and a thin outline frame, the headline word repeated as faded ghost text across the background, a large 3D cartoon warrior mascot (invented, non-branded) in a woven hat holding a fan of playing cards with chips stacked in front, a frosted-glass card on the right and a solid red rounded plate on the left with a subtle white outline glow around the mascot. COMPOSITION: two-line white headline top-center with a small red tag, giant white word behind the mascot's head, mascot centered, plates at mid-height on both sides, letter-spaced footer line. LIGHTING: purple ambient light, soft rim glow, glossy 3D shading. TYPOGRAPHY & LAYOUT: bold white uppercase, glass and solid plates, tiny footer; all inside the safe zone. COLOR: purple, white and red (max 3 dominant colors). AVOID: real characters, clutter, unreadable ghost text overlapping the headline.",
  },
  {
    id: "preset92",
    fields: [FIELD_SPORT, FIELD_TIME_OF_DAY],
    name: "Атлет + выноски преимуществ",
    description: "Атлет бежит на камеру, лаймовые линии-выноски с плюсами букмекера, гигантский заголовок",
    gradient: g("#0a0a0a", "#65a30d", "#bef264"),
    examples: ex("#0a0a0a", "#65a30d", "#1a2e05", "#bef264"),
    isNew: true,
    template:
      "Create an annotated-benefits sportsbook banner for {SUBJECT}. STYLE: a dark stadium tunnel with sunlit exit, a non-identifiable athlete in a plain black kit running straight at the camera on a lime track, thin lime callout lines with dots pointing from the body to four short sportsbook benefit labels (fast payouts, boosted odds, live streams, cash out) on the left and right, a ball and a bet-slip ticket floating with motion trails. COMPOSITION: athlete centered, a giant three-line headline above mixing lime and white words, callouts at mid-height, a two-line CTA stack at the bottom. LIGHTING: backlit sun flare from the tunnel exit, lime glow on the track. TYPOGRAPHY & LAYOUT: extra-bold uppercase headline, small sans callout labels, footer CTA; all inside the safe zone. COLOR: black, lime and white only. AVOID: recognizable faces, real logos, callouts overlapping the headline.",
  },
  {
    id: "preset93",
    fields: [FIELD_CASINO_PROP],
    name: "Сёрф на золотой монете",
    description: "Синий лучевой фон, персона в костюме сёрфит на гигантской золотой монете, купюры в воздухе",
    gradient: g("#1e3a8a", "#2563eb", "#facc15"),
    examples: ex("#1e3a8a", "#2563eb", "#1e40af", "#facc15"),
    isNew: true,
    template:
      "Create a big-win action banner for {SUBJECT}. " +
      "STYLE: a bright blue radial light-burst background with streaks converging on the horizon, a surprised non-identifiable person in a dark suit with a flying tie balancing as if surfing on a giant gold coin, banknotes and smaller gold coins tumbling through the air. " +
      "COMPOSITION: figure centered on the coin in the lower-middle, motion lines radiating from the center, headline zone at the top, CTA at the bottom. " +
      "LIGHTING: strong backlight from the center of the burst, glossy gold reflections. " +
      "TYPOGRAPHY & LAYOUT: bold italic uppercase headline, one CTA button; all inside the safe zone. " +
      "COLOR: blue, gold and white (max 3 dominant colors). " +
      "AVOID: real currency designs, recognizable faces, clutter.",
  },
  {
    id: "preset94",
    fields: [FIELD_BONUS_BADGE],
    name: "Бонус 200% в неоне",
    description: "Чёрный фон, плоские неоновые фигуры, гигантский процент бонуса, модель с фишками",
    gradient: g("#0a0a0a", "#a3e635", "#ec4899"),
    examples: ex("#0a0a0a", "#a3e635", "#171717", "#ec4899"),
    isNew: true,
    template:
      "Create a neon flat-shape casino bonus banner for {SUBJECT}. STYLE: a black background with flat cut-out shapes in neon lime and hot pink behind a non-identifiable model in a lime blazer and lime sunglasses holding a stack of casino chips, the bonus figure rendered as a giant flat lime percentage with the word BONUS in pink. COMPOSITION: model on the right, the giant offer stack on the left taking two-thirds of the height, a small intro word above it, a two-line subline and an outlined CTA button at the bottom-left. LIGHTING: crisp studio beauty light, flat graphic shapes without shading. TYPOGRAPHY & LAYOUT: ultra-bold grotesque numbers and words, tiny letter-spaced captions; all inside the safe zone. COLOR: black, lime and pink only. AVOID: gradients, recognizable faces, more than 3 dominant colors.",
  },
  {
    id: "preset95",
    fields: [],
    name: "Синтвейв: фишки и закат",
    description: "Розовый закат-круг, пальмы, неоновые полосы, персонаж в маске с фишками",
    gradient: g("#1a0521", "#be185d", "#f472b6"),
    examples: ex("#1a0521", "#be185d", "#3b0764", "#f472b6"),
    isNew: true,
    template:
      "Create a synthwave casino party banner for {SUBJECT}. STYLE: a magenta retro sunset circle behind a palm-tree and city silhouette, glowing pink neon light streaks sweeping across the bottom, a non-identifiable figure in a knitted balaclava, varsity jacket and chains fanning casino chips with a finger to the lips. COMPOSITION: figure centered, sunset circle framing the head, a letter-spaced intro line and logo at the top, a big pink headline and details stacked at the bottom. LIGHTING: magenta ambient glow, neon rim light, soft haze. TYPOGRAPHY & LAYOUT: bold pink display headline, white sans details, letter-spaced caption; all inside the safe zone. COLOR: magenta, deep purple and white (max 3 dominant colors). AVOID: real event names, recognizable faces, clutter.",
  },
  {
    id: "preset96",
    fields: [],
    name: "Карточный король в разрыве",
    description: "Красная бумага с прорывом, сквозь дыру смотрят глаза карточного короля, заголовок под ней",
    gradient: g("#7f1d1d", "#dc2626", "#e5e5e5"),
    examples: ex("#7f1d1d", "#dc2626", "#991b1b", "#e5e5e5"),
    isNew: true,
    template:
      "Create a torn-paper reveal casino banner for {SUBJECT}. STYLE: a textured red paper surface torn open horizontally across the upper half, the engraved eyes of a playing-card king (classic card illustration style, invented) visible through the tear, card-suit corners peeking in at the edges. COMPOSITION: the torn window in the upper half, a two-line headline in the lower half with one word in a small red label and a highlighted subline plate, small captions in the top-right and bottom-left corners. LIGHTING: soft raking light showing paper fibers and torn edges. TYPOGRAPHY & LAYOUT: bold sans headline in white and light red, small captions; all inside the safe zone. COLOR: red, off-white and black (max 3 dominant colors). AVOID: real currency portraits, clutter, more than 3 dominant colors.",
  },
  {
    id: "preset97",
    fields: [],
    name: "Ястреб с фишкой (волна)",
    description: "Красно-белые волнистые буквы, монохромный ястреб с красным глазом и золотой фишкой в клюве",
    gradient: g("#b91c1c", "#dc2626", "#fafafa"),
    examples: ex("#b91c1c", "#dc2626", "#7f1d1d", "#fafafa"),
    isNew: true,
    template:
      "Create a wave-typography casino banner for {SUBJECT}. STYLE: a solid red background, huge white headline letters distorted into vertical wave ripples filling the frame, a monochrome black-and-grey feathered bird-of-prey head (invented) diving from the top with a single glowing red eye and a gold casino chip clenched in its beak, a thin script slogan and a small date-stack in the corners. COMPOSITION: bird head across the upper-left, wave letters behind and below it, script line center-right, small caption blocks top-right and bottom. LIGHTING: flat graphic contrast, subtle sheen on the feathers and the gold chip. TYPOGRAPHY & LAYOUT: rippled ultra-bold uppercase, thin script accent, tiny caps; keep the safe zone readable. COLOR: red, white and black only, gold only on the chip. AVOID: national emblems, more than 3 dominant colors, illegible waves.",
  },
  {
    id: "preset98",
    fields: [],
    name: "Карты в воздухе (яп. коллаж)",
    description: "Бежевая бумага, оранжевые круги и мазки, персона бросает карты, большой белый заголовок",
    gradient: g("#f5f5f4", "#ea580c", "#1c1917"),
    examples: ex("#f5f5f4", "#ea580c", "#e7e5e4", "#1c1917"),
    isNew: true,
    template:
      "Create a Japanese-editorial collage casino banner for {SUBJECT}. STYLE: aged beige paper background, big orange sun circles and horizontal brush-smear strokes, a non-identifiable person in a black jacket flicking a playing card toward the camera with more cards and dice in mid-air, small engraved cranes, calligraphy-style vertical glyphs at the top, tiny dots and arrow marks. COMPOSITION: figure center-right with the card hand foreground-left, a giant white bold headline across the lower third, glyph block top-left, micro captions in the corners. LIGHTING: flat print-like tones, paper grain, muted contrast. TYPOGRAPHY & LAYOUT: giant condensed white headline, tiny sans captions, decorative glyphs; keep the safe zone readable. COLOR: beige, orange and black (max 3 dominant colors). AVOID: recognizable faces, readable real-language slogans in the glyphs, clutter.",
  },
  {
    id: "preset99",
    fields: [],
    name: "Король джекпотов (готика)",
    description: "Готический розовый шрифт на ч/б гравюре карточного короля с фишками, брызги краски",
    gradient: g("#0a0a0a", "#be123c", "#fb7185"),
    examples: ex("#0a0a0a", "#be123c", "#171717", "#fb7185"),
    isNew: true,
    template:
      "Create a gothic-splatter casino banner for {SUBJECT}. STYLE: a black background with a black-and-white ink-engraving illustration of a crowned, bearded playing-card king (invented, non-identifiable) in round shades holding a sword with a stack of casino chips and an ace tucked in the crown, a large blackletter gothic headline in hot pink layered over the crown, pink paint splatters and drips, spray-paint script phrases across the lower half. COMPOSITION: figure bust centered, blackletter headline top-center overlapping the crown, script phrases on both sides at the bottom. LIGHTING: flat engraving contrast, no photographic light. TYPOGRAPHY & LAYOUT: ornate blackletter headline, graffiti script; keep the headline readable inside the safe zone. COLOR: black, white and hot pink only. AVOID: religious or political symbols, more than 3 dominant colors, illegible gothic letters.",
  },
  {
    id: "preset100",
    fields: [],
    name: "Слот-автомат в студии",
    description: "Монохромный бирюзовый сет, гигантский слот-автомат, модель опирается на него, шахматный пол",
    gradient: g("#0f766e", "#14b8a6", "#facc15"),
    examples: ex("#0f766e", "#14b8a6", "#0d9488", "#facc15"),
    isNew: true,
    template:
      "Create a monochrome set-design casino banner for {SUBJECT}. STYLE: a fully teal studio set with angled walls and a teal-and-cream checkered floor, a giant glossy teal slot machine with a gold lever and lit reels as the hero, a non-identifiable model in a pastel outfit leaning to rest a hand on its lever, two smaller slot cabinets in the background. COMPOSITION: giant slot machine center-low, model beside it, a three-line headline centered at the top with the middle word in yellow, a three-word tagline stack on the right with a yellow underline. LIGHTING: bright soft studio light, clean shadows, glossy highlights on the cabinet. TYPOGRAPHY & LAYOUT: extra-bold rounded uppercase headline in white and yellow, small tagline; all inside the safe zone. COLOR: teal, cream and yellow only. AVOID: real brand labels, recognizable faces, more than 3 dominant colors.",
  },
  {
    id: "preset101",
    fields: [FIELD_CASINO_PROP, FIELD_WIN_CALLOUT],
    name: "Вихрь купюр + лента-заголовок",
    description: "Тёплый оранжевый фон, вихрь купюр, лента-заголовок обвивает героя в красном",
    gradient: g("#7c2d12", "#ea580c", "#fde047"),
    examples: ex("#7c2d12", "#ea580c", "#9a3412", "#fde047"),
    isNew: true,
    template:
      "Create a money-whirlwind banner for {SUBJECT}. " +
      "STYLE: a warm orange-to-yellow glowing background, a whirlwind of banknotes spiraling through the air, a smiling non-identifiable person in a flowing red satin dress with hair blown by the wind, a red satin ribbon carrying the headline in retro cream 3D lettering wrapping around the figure. " +
      "COMPOSITION: figure centered full-height, the ribbon headline curving across the waist, banknotes largest at the corners, a small tagline on the ribbon's lower band. " +
      "LIGHTING: warm golden backlight with a lens flare, glossy satin highlights. " +
      "TYPOGRAPHY & LAYOUT: retro deco 3D headline on the ribbon, short uppercase tagline; all inside the safe zone. " +
      "COLOR: orange, red and cream (max 3 dominant colors). " +
      "AVOID: real currency designs, recognizable faces, clutter.",
  },
];
