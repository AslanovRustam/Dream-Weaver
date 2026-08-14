// One-off: generate a 3:2 preview banner per template via OpenAI images, save
// to public/previews/<id>.png. Skips ids that already have a file so it can be
// re-run until all are done. Usage:
//   node scripts/gen-previews.mjs            # all missing
//   node scripts/gen-previews.mjs preset6    # only this id (test)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "previews");

// --- read OPENROUTER_API_KEY from .env.local (the OpenAI key is invalid; the
//     OpenRouter key works and hosts the same image models) ---
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const KEY = (env.match(/^OPENROUTER_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) throw new Error("OPENROUTER_API_KEY not found in .env.local");
const MODELS = ["openai/gpt-5.4-image-2", "google/gemini-3.1-flash-image"];

const SUFFIX =
  " Format: 3:2 landscape advertising banner. Render a bold English headline and a clear call-to-action button; ALL in-image text must be in correct English. Keep every text, number, logo and key element within the central 60% safe zone. High-contrast, clean, premium, highly readable. Avoid gibberish/scrambled text, clutter, and more than 3 dominant colors.";

// id → { subject (invented user request, EN), style }
const ITEMS = [
  { id: "preset1", subject: "VoltMax tropical energy drink, 200mg caffeine", style: "High-impact e-commerce product infographic banner: a hand holds the product toward camera in the foreground (macro blur), a smiling model mid-ground, soft gradient backdrop with rainbow prism flares, big bold NUMBERS with short unit captions." },
  { id: "preset2", subject: "the online slot 'Sweet Bonanza'", style: "Premium cinematic gaming slot banner: glossy high-contrast, rich dark atmospheric background, glowing slot reels and candy/fruit jackpot symbols, particles, smoke, reflections." },
  { id: "preset3", subject: "a New Year mega poker tournament with a $100,000 prize pool", style: "Premium gambling event banner: cinematic, glowing casino props (poker cards, golden chips), tasteful festive New Year accents, dynamic energy." },
  { id: "preset4", subject: "the Champions League final: PSG vs Liverpool", style: "Premium sports-betting face-off poster: two football club crests mirrored left and right with a bold VS in the center, stadium floodlights, sparks, dramatic warm-vs-cool split. No real player faces, emblems only." },
  { id: "preset5", subject: "a UFC lightweight title fight night", style: "Cinematic combat-sports fighter portrait: a powerful MMA fighter with wet slicked-back hair, sweat, gloves raised in a fighting stance, orange-red glowing energy lines around the head, hard rim light, dark arena." },
  { id: "preset6", subject: "Mega Jackpot Night at LuckyBet Casino", style: "Explosive big-win casino banner: a burst of gold coins, casino chips and confetti flying toward the camera, volumetric light rays, sparks, dark navy base with gold and lime accents." },
  { id: "preset7", subject: "Neon Nights online casino launch", style: "Cyberpunk ultraviolet neon casino banner: glowing purple and cyan light, holographic UI panels, laser grid, wet reflective floor, glassmorphism, near-black base." },
  { id: "preset8", subject: "European Roulette live tables", style: "Casino roulette banner: a glossy spinning roulette wheel with the ball caught mid-spin (motion blur), green felt table, chips, gold rim, warm spotlight, red/black/gold palette." },
  { id: "preset9", subject: "Retro Vegas Slots Weekend", style: "Retro 80s-90s Las Vegas vaporwave banner: chrome 3D lettering, magenta-purple-orange sunset gradient, palm-tree silhouettes, marquee light bulbs, subtle VHS grain, grid horizon." },
  { id: "preset10", subject: "VIP High Roller Club — exclusive access", style: "Luxury black-and-gold VIP casino banner: deep blacks, gold accents, dramatic single-source lighting, soft smoke, elegant high-roller mood, gold-foil typography." },
  { id: "preset11", subject: "Arcade Spins — new comic-style slot", style: "Comic pop-art casino banner: thick black ink outlines, Ben-Day halftone dots, vivid primary colors, dynamic action lines, a star-burst callout, cel-shaded flat lighting." },
  { id: "preset12", subject: "High Stakes Poker Room", style: "Dramatic poker-noir banner: a royal flush and tall stacks of casino chips shot macro on dark felt, moody low-key lighting, cigar-smoke haze, gold accents, high-stakes mood." },
  { id: "preset13", subject: "Live betting stats hub", style: "Futuristic sports-betting HUD data-board banner: glowing holographic odds, stat bars and line graphs, translucent UI panels, stadium backdrop, electric blue and cyan on dark navy." },
  { id: "preset14", subject: "Street Bets — urban sportsbook", style: "Urban street-graffiti sports banner: spray-paint textures, graffiti tags on a concrete wall, dripping paint, torn poster layers, gritty grain, bold hype energy." },
  { id: "preset15", subject: "Dragon's Gold fantasy slot", style: "Epic fantasy slot banner: glowing magical runes, treasure hoard and a dragon, enchanted particles, ornate carved gold frame, deep purple/navy with gold and arcane light." },
  { id: "preset16", subject: "your winning bet slip — cash out big", style: "Sports-betting WIN banner: a glowing bet slip marked WON, cash and coins raining, green success glow, celebration sparks, a big payout number, dark base with betting green and gold." },
  { id: "preset17", subject: "Live in-play betting — Premier League", style: "LIVE in-play betting banner: a pulsing red LIVE badge, an in-play odds ticker, motion-blurred action, floodlit stadium, HUD score strip, broadcast red accent." },
  { id: "preset18", subject: "build your acca — x50 boosted combo", style: "Accumulator/parlay betting banner: a chain of linked selections leading to one huge total-odds multiplier, glowing connectors, ascending arrow, navy base with blue and lime." },
  { id: "preset19", subject: "Odds Boost Friday — supercharged prices", style: "ODDS BOOST betting banner: a big boosted odds figure with lightning bolts and electric sparks, a 'boosted from to' motif, near-black base with electric blue and cyan." },
  { id: "preset20", subject: "100% welcome bonus + free bet", style: "Welcome-bonus betting banner: a glowing gift box spilling coins, a bold bonus percentage callout, ribbons and sparkles, violet base with gold accent." },
  { id: "preset21", subject: "CS2 Major — bet on the finals", style: "Esports-betting banner: a competitive gaming arena with huge LED screens, neon RGB stage lighting, holographic match UI, a betting odds overlay." },
  { id: "preset22", subject: "Grand National race day betting", style: "Racing-betting banner: race horses charging toward a finish line, heavy motion blur, dust, checkered-flag motif, dark base with red/orange speed accents." },
  { id: "preset23", subject: "Weekly Toto jackpot — €1,000,000 pool", style: "Toto/lottery betting banner: bouncing numbered lottery balls, lucky numbers, a glowing prize-pool figure, sparkles and confetti, teal base with gold." },
  { id: "preset24", subject: "El Clasico derby — Barcelona vs Real Madrid", style: "Rivalry derby betting banner: two large team crests facing off across a central VS divider, sparks at the clash point, dramatic warm-vs-cool split, arena atmosphere, no faces." },
  { id: "preset25", subject: "cash out anytime — secure your winnings", style: "CASH OUT betting banner: a glowing green CASH OUT button being pressed, a bet slip converting to guaranteed cash, coins, confident green success glow with lime accent." },
  { id: "preset26", subject: "Premier League Matchday — bet on the big game", style: "Football (soccer) sports-betting banner: a stadium with floodlights and blurred stands, a dynamic stylized non-identifiable footballer striking a ball, pitch green tint, cinematic rim light, haze; no real named player or real club logos; pitch green + white palette." },
  { id: "preset27", subject: "NBA Tonight — bet on the hardwood", style: "Basketball sports-betting banner: an indoor arena with reflective hardwood, spotlight beams, a dynamic stylized non-identifiable player dunking, motion trail; no real named player or logos; dark base + basketball orange." },
  { id: "preset28", subject: "NFL Sunday — bet the spread", style: "American football (NFL-style) sports-betting banner: a stadium with end-zone lights and haze, a dynamic stylized non-identifiable player in helmet and pads charging with the ball; no real named player or logos; navy/steel base + bright accent." },
  { id: "preset29", subject: "Grand Slam Final — bet on center court", style: "Tennis sports-betting banner: a stadium tennis court, a dynamic stylized non-identifiable player mid-serve with racket and ball, athletic motion, crisp rim light; no real named player; court blue + lime accent." },
  { id: "preset30", subject: "T20 Clash — bet on the match", style: "Cricket sports-betting banner: a floodlit cricket field, a dynamic stylized non-identifiable batsman mid-shot with bat and ball, kit and pads, motion; no real named player or logos; field green/teal + gold accent." },
  { id: "preset31", subject: "MLB Game Day — bet on the diamond", style: "Baseball (MLB-style) sports-betting banner: a baseball diamond with stadium lights at dusk, a dynamic stylized non-identifiable batter mid-swing with bat and ball, cap and uniform; no real named player or logos; navy/red + off-white accent." },
  { id: "preset32", subject: "NHL Faceoff — bet on the ice", style: "Ice hockey (NHL-style) sports-betting banner: an ice rink with frost, boards and cold blue glow, a dynamic stylized non-identifiable player skating and shooting with stick and puck, ice spray; no real named player or logos; ice blue + white." },
  { id: "preset33", subject: "Race Day — bet the favourite", style: "Horse-racing sports-betting banner: a racetrack with turf, rails and grandstand, stylized racehorses with jockeys charging toward the finish line, heavy motion blur and dust; no real named horses or silks; turf green + gold accent." },
  { id: "preset34", subject: "Fight Night — bet on the main event", style: "Combat-sports (boxing/MMA) betting banner: a dark arena with a ring-ropes or octagon-cage silhouette, single hard spotlight, smoke and sparks, a dynamic stylized non-identifiable fighter in a stance with gloves raised, sweat and rim light; no real named athlete; dark base + red and gold." },
  { id: "preset35", subject: "Esports Finals — bet on the pros", style: "Esports betting banner: a dark arena with huge LED screens, neon RGB stage lighting and stage smoke, a dynamic stylized non-identifiable pro gamer with a headset at a gaming setup, holographic UI; no real named player or team logos; dark base + violet and cyan neon." },
];

const only = process.argv[2];
const todo = ITEMS.filter((it) => !only || it.id === only);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function extractImage(msg) {
  const first = msg?.images?.[0];
  if (first) {
    if (typeof first === "string") return first;
    const iu = first.image_url;
    if (typeof iu === "string") return iu;
    if (iu && typeof iu === "object" && "url" in iu) return iu.url;
  }
  if (typeof msg?.content === "string") {
    const m = msg.content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    if (m) return m[0];
  }
  return undefined;
}

async function gen(item, model) {
  const prompt = `${item.style} Advertise: ${item.subject}.${SUFFIX}`;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
      "HTTP-Referer": "https://dream-weaver-studio.local",
      "X-Title": "Dream Weaver Studio",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "3:2" },
      aspect_ratio: "3:2",
    }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 300) };
  const data = JSON.parse(text);
  const url = extractImage(data?.choices?.[0]?.message);
  if (!url) return { ok: false, status: 200, detail: "no image in response" };
  const b64 = url.includes(",") ? url.slice(url.indexOf(",") + 1) : url;
  writeFileSync(join(OUT_DIR, `${item.id}.png`), Buffer.from(b64, "base64"));
  return { ok: true };
}

let done = 0, skipped = 0, failed = 0;
for (const item of todo) {
  const outPath = join(OUT_DIR, `${item.id}.png`);
  if (existsSync(outPath) || existsSync(join(OUT_DIR, `${item.id}.webp`))) {
    skipped++; console.log(`skip  ${item.id} (exists)`); continue;
  }
  process.stdout.write(`gen   ${item.id} — "${item.subject}" ... `);
  let r;
  for (const model of MODELS) {
    r = await gen(item, model);
    if (r.ok) break;
    process.stdout.write(`[${model} ${r.status}] `);
  }
  if (r.ok) { done++; console.log("OK"); }
  else { failed++; console.log(`FAIL ${r.status}: ${r.detail}`); }
}
console.log(`\nDone. generated=${done} skipped=${skipped} failed=${failed} (total ${todo.length})`);
