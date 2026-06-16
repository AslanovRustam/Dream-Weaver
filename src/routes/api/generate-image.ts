import { createFileRoute } from "@tanstack/react-router";

import { authErrorResponse, requireUser } from "../../lib/auth-server";
import { getAdminClient } from "../../lib/supabase/admin";
import { getGroupTemplate } from "../../lib/bannerSizes";
import { recordGenerationAndUpload } from "../../lib/history/cardWriter";
import { logSystem, newRequestId } from "../../lib/logger";
import { openAiSizeString, resolveCanvasSize } from "../../lib/imageSizes";
import { safeFetchImage } from "../../lib/safe-fetch";
import { rateLimitResponse, dataUrlByteLength, MAX_DATAURL_BYTES } from "../../lib/request-guard";

// Fallback coefficient if the pricing table is missing a row for this
// (model, quality). Kept small so we never accidentally drain a balance.
const DEFAULT_COEFFICIENT = 0.001;

// SEC-H2: minimum balance required BEFORE we call the (paid) provider.
// A coarse floor whose job is to stop a near-zero-balance account from
// burning provider calls. The real protection is the post-spend check
// further down: if the actual charge can't be covered, we do NOT return
// the image. A precise per-request hold belongs to the QUEUE-1 billing work.
const MIN_BALANCE_TO_GENERATE = 1;

// Resolve the pricing-table key from the request model string.
// Anything that looks like Gemini/Google maps to "gemini-nano"; everything
// else is billed as "gpt-image-2".
function pricingModelKey(modelStr: string | undefined): "gemini-nano" | "gpt-image-2" {
  const s = (modelStr || "").toLowerCase();
  if (s.includes("gemini") || s.startsWith("google/")) return "gemini-nano";
  return "gpt-image-2";
}

type Body = {
  preset_id?: string;
  subject?: string;
  template?: string | null;
  banner_text?: string;
  button_text?: string;
  aspect_ratio?: string;
  model?: string;
  // Resize-batch flow: pass the previously-approved master banner here so
  // the model adapts the composition to a new aspect ratio instead of
  // generating from scratch. dataURL just like other refs.
  source_image?: string;
  /** Exact pixel dimensions of the largest target tile in this aspect
   *  bucket. Used to tell the model what canvas it's actually designing
   *  for and to compose with a crop-safe margin. */
  target_w?: number;
  target_h?: number;
  /** Output of the vision pre-pass (/api/extract-master). When present
   *  the prompt gets a MASTER VISUAL FACTS block with the exact texts
   *  to render and the named central object — fixes drift in fine
   *  printed text and prevents card↔trophy substitutions. */
  master_details?: {
    central_object?: string;
    central_object_texts?: string[];
    person?: string | null;
    scene?: string;
    colors?: string[];
    style?: string;
    /** Legacy: plain string[]. Modern: array of {text, position}. */
    banner_texts?: Array<string | { text: string; position?: string }>;
  };
  /** Use-case group id from the resize batch (stories/youtube/pinterest/...).
   *  Selects a per-use-case layout template that's prepended to the
   *  composition rules so the model produces a banner shaped for the
   *  ACTUAL platform it'll be deployed on, not generic portrait/landscape. */
  group_id?: string;
  /** History feature — when present, this generation is attached to the
   *  given existing card (resize flow). When absent and there is no
   *  source_image, a new card is created (master flow). */
  card_id?: string;
  /** Resize-batch bucket calls set this so the bill goes through but the
   *  generated image isn't auto-attached to the card. Tiles get added
   *  separately via /api/history/$cardId/resize-tile after client crop. */
  skip_history_attach?: boolean;
  ad_texts_enabled?: boolean;
  person_enabled?: boolean;
  person_gender?: "female" | "male" | null;
  brand_name?: string;
  brand_logo?: string;
  language?: string;
  slot_name?: string;
  slot_screenshot?: string;
  slot_logo?: string;
  event_text?: string;
  subheadline_text?: string;
  banner_text_enabled?: boolean;
  button_text_enabled?: boolean;
  subheadline_enabled?: boolean;
  sport_type?: string;
  match_type?: string;
  side_a_name?: string;
  side_a_logo?: string;
  side_b_name?: string;
  side_b_logo?: string;
  event_name?: string;
  match_datetime?: string;
  location?: string;
  bonus_text?: string;
  bonus_enabled?: boolean;
  players_enabled?: boolean;
  side_a_players?: string;
  side_b_players?: string;
  quality?: "low" | "medium" | "high";
  // legacy
  prompt?: string;
};

// Pricing in this app is driven by the pricing_coefficients table in the
// DB (total_tokens × coefficient), not by hard-coded provider prices —
// we keep the old USD reference removed.

const LANG_LABELS: Record<string, string> = {
  ru: "Russian (Русский)",
  uk: "Ukrainian (Українська)",
  en: "English",
  es: "Spanish (Español)",
  de: "German (Deutsch)",
  fr: "French (Français)",
  pl: "Polish (Polski)",
};

// openAiSizeFor moved to src/lib/imageSizes.ts so it can be shared
// with cardWriter (which records the same dimensions on the
// generations row). Local alias kept for readability.
const openAiSizeFor = openAiSizeString;

function slotPrompt(
  slotName: string,
  bannerText: string,
  buttonText: string,
  aspectRatio: string,
  language: string,
  hasScreenshot: boolean,
  hasLogo: boolean,
): string {
  const [w, h] = aspectRatio.split(":").map(Number);
  const layout =
    w && h && w > h
      ? "Horizontal two-column layout: logo and text block on a darker clean left side, key visual on the right occupying 40-55% of the width."
      : "Square/vertical centered layout: logo, key visual, headline, supporting text, CTA with generous spacing and safe margins.";
  const langLabel = LANG_LABELS[language] || "the selected/most natural language";
  const isSpecificLang = language && language !== "auto" && LANG_LABELS[language];
  const renderInstr = (label: string, txt: string) =>
    isSpecificLang
      ? `${label} must be rendered in ${langLabel}; if the source text "${txt}" is in a different language, translate it accurately into ${langLabel} and render the translation (do NOT keep the source language).`
      : `${label} must appear verbatim: "${txt}".`;

  return [
    `Create a premium modern gaming advertisement banner for the slot${slotName ? ` "${slotName}"` : ""}.`,
    `Aspect ratio: ${aspectRatio}. ${layout}`,
    "Style: vibrant cinematic gaming advertising, glossy high contrast, rich dark atmospheric background, dimensional depth, rim light, neon accents, particles, smoke, reflections, professional contrast and clean hierarchy.",
    hasScreenshot
      ? "Use the attached slot screenshot as the key visual reference: preserve its character/symbol identity, art direction, color palette and mood, but rebuild it as a polished premium ad composition; do not copy tiny UI text."
      : "Create a strong slot-inspired key visual based on the slot name and premium casino-game aesthetics.",
    hasLogo
      ? "Use the attached logo as the primary logo/wordmark; preserve its shape, proportions and colors, do not redesign it."
      : "If no logo is provided, create a clean readable slot-style wordmark from the slot name.",
    `All readable in-image text MUST be written in ${langLabel}.${isSpecificLang ? " Any provided text in a different language must be translated into " + langLabel + " before being rendered." : ""} IMPORTANT EXCEPTION: brand/slot/team logos, wordmarks and emblems (whether uploaded as references or shown inside the slot screenshot) must be reproduced exactly as-is in their original language and lettering — NEVER translate, transliterate, relocalize or restyle any text that is part of a logo.`,
    bannerText
      ? renderInstr("Main headline text", bannerText)
      : "Create only a short readable headline if needed; avoid clutter.",
    buttonText
      ? renderInstr("CTA button text", buttonText)
      : "Include a visible CTA button only if it improves the ad hierarchy.",
    "Hierarchy: logo → headline → supporting text → CTA → key visual. Keep text away from detailed background areas. Avoid unreadable tiny text, visual clutter, weak contrast, and overlap with logo or important text.",
  ].join(" ");
}

function eventPrompt(args: {
  subject: string;
  aspectRatio: string;
  language: string;
  brandName: string;
  hasLogo: boolean;
  eventText: string;
  personEnabled: boolean;
  personGender: "female" | "male" | null;
  adTextsEnabled: boolean;
  headlineEnabled: boolean;
  headlineText: string;
  ctaEnabled: boolean;
  ctaText: string;
  subheadlineEnabled: boolean;
  subheadlineText: string;
}): string {
  const {
    subject,
    aspectRatio,
    language,
    brandName,
    hasLogo,
    eventText,
    personEnabled,
    personGender,
    adTextsEnabled,
    headlineEnabled,
    headlineText,
    ctaEnabled,
    ctaText,
    subheadlineEnabled,
    subheadlineText,
  } = args;
  const [w, h] = aspectRatio.split(":").map(Number);
  const isHorizontal = w && h && w > h;
  const langLabel = LANG_LABELS[language] || "the most natural language for the brand";
  const logoPos = isHorizontal ? "TOP-LEFT" : "TOP-CENTER";

  const layout = isHorizontal
    ? "Two-column composition. LEFT side: logo top-left, headline large and bold below logo, supporting text below headline, CTA button below text — all left-aligned, left side visually calmer and darker for readability. RIGHT side: key visual occupies 40–55% of width, large, dimensional, premium, with cinematic glow, reflections, particles. Eye flow: logo → headline → supporting text → CTA → key visual. Keep all content within 5–8% safe margins."
    : "Centered vertical composition. Order top to bottom: 1) logo at top center, 2) key visual as dominant central focus (large, detailed, premium), 3) headline centered and bold, 4) supporting text centered and smaller, 5) CTA button centered with accent glow. Consistent vertical spacing, no long text lines, do not overcrowd the top area. Keep content within 5–8% safe margins.";

  const lines: string[] = [];
  lines.push(`Create a premium gambling/betting advertisement banner in ${aspectRatio} format.`);
  lines.push(`CORE BRIEF: ${subject}`);

  if (brandName || hasLogo) {
    lines.push(`BRAND: ${brandName || "(unnamed brand)"}`);
    if (hasLogo)
      lines.push("Use the provided logo as reference for brand identity and color palette.");
    else if (brandName)
      lines.push("Derive a color palette that matches the brand name and gambling theme.");
  } else {
    lines.push(
      "BRAND: none provided — use creative palette aligned with the gambling theme and the event mood.",
    );
  }

  lines.push(
    "CONTENT THEME: Determine the specific gambling sub-vertical (poker, slots, roulette, sportsbook, esports, lottery, casino general) from the core brief above and build the key visual around it. Use iconic premium props of that vertical (golden cards and chips for poker; glowing slot reels and jackpot symbols for slots; spinning roulette wheel for roulette; stadium lights and balls for sportsbook; arena and gaming gear for esports; lottery tickets and bouncing balls for lottery).",
  );

  if (eventText) {
    lines.push(
      `EVENT MOOD: Add subtle visual hints of "${eventText}" through atmospheric lighting, small particles, and minor decorative accents. Keep brand identity dominant — do NOT replace brand colors with the event's traditional palette. The event should feel like a tasteful seasonal layer, not a costume.`,
    );
  }

  if (personEnabled) {
    const who =
      personGender === "male" ? "confident stylish young man" : "confident attractive young woman";
    lines.push(
      `HUMAN SUBJECT: Place a ${who} as the central subject. Premium gambling-ad aesthetic, expressive, cinematic lighting, glossy skin, sharp focus.`,
    );
  }

  lines.push(
    "STYLE: vibrant, cinematic, highly detailed, glossy, high-contrast, depth, glow effects, atmospheric lighting, soft smoke, particles, reflections, dynamic energy. Clean, modern, highly readable composition.",
  );
  lines.push(`LAYOUT: ${layout}`);

  // TEXT ON BANNER
  const isSpecificLang = language && language !== "auto" && LANG_LABELS[language];
  const renderInstr = (txt: string) =>
    isSpecificLang
      ? `rendered in ${langLabel}; if "${txt}" is in a different language, translate it accurately into ${langLabel} before rendering (do NOT keep the source language)`
      : `appearing verbatim: "${txt}"`;
  const textLines: string[] = [
    `TEXT ON BANNER (all in-image text MUST be in ${langLabel}${isSpecificLang ? "; translate any source-language text into " + langLabel : ""}; EXCEPTION: brand/team/sponsor logos, wordmarks and emblems must be kept exactly as-is in their original language and lettering — NEVER translate or relocalize logo text):`,
  ];
  if (headlineEnabled) {
    if (headlineText)
      textLines.push(
        `- Headline: "${headlineText}" — ${renderInstr(headlineText)}, large and bold.`,
      );
    else
      textLines.push(
        `- Headline: generate a powerful short headline in ${langLabel} matching the brief, event and brand mood.`,
      );
  } else {
    textLines.push("- Headline: no headline text on the banner.");
  }
  if (subheadlineEnabled) {
    if (subheadlineText)
      textLines.push(`- Supporting text: "${subheadlineText}" — ${renderInstr(subheadlineText)}.`);
    else
      textLines.push(
        `- Supporting text: generate 2–3 short benefits in ${langLabel} (e.g. "Real Players / Big Tournaments / Instant Payouts") matching the brief and brand.`,
      );
  } else {
    textLines.push("- Supporting text: none.");
  }
  if (ctaEnabled) {
    if (ctaText)
      textLines.push(
        `- CTA button: "${ctaText}" — ${renderInstr(ctaText)}, rounded pill button, accent brand color, glowing.`,
      );
    else
      textLines.push(
        `- CTA button: generate a short action CTA in ${langLabel} (1–3 words like "Play Now", "Join", "Claim Bonus"), rounded pill, accent color, glowing.`,
      );
  } else {
    textLines.push("- CTA button: none.");
  }
  lines.push(textLines.join("\n"));

  if (adTextsEnabled) {
    lines.push(
      'PROMOTIONAL OVERLAY: Include bold marketing accents — bonus numbers, "WELCOME BONUS", "FREE SPINS", "24/7", or similar gambling-ad style callouts harmonized with the headline.',
    );
  }

  if (hasLogo) {
    lines.push(
      `LOGO PLACEMENT: Place the provided brand logo${brandName ? ` of "${brandName}"` : ""} at ${logoPos}, small and clean. Reproduce it exactly, do not redesign.`,
    );
  } else {
    lines.push(
      "BRAND LOGO: No brand logo provided — do NOT invent, draw, or render any brand logo, wordmark, emblem, or brand mark anywhere on the banner. The brand name may appear only as plain typographic text if needed, never stylized as a logo.",
    );
  }

  const paletteSource = hasLogo
    ? "the uploaded logo"
    : brandName
      ? "the brand name and gambling theme"
      : "creative freedom aligned with the gambling theme and event mood";
  lines.push(
    `COLOR RULES:\n- Derive dominant palette from ${paletteSource}.\n- Use 2–3 dominant colors maximum.\n- Strong contrast between text and background.\n- Accent color for CTA must pop without breaking harmony.`,
  );
  lines.push(
    "AVOID: text over busy areas, weak contrast, clutter, logo overlapping text, more than 3 dominant colors, generic stock-photo look.",
  );

  return lines.join("\n\n");
}

const SPORT_BG: Record<string, string> = {
  football: "stadium with floodlights, packed stands blurred, pitch green tint, atmospheric smoke",
  basketball: "indoor arena with court hardwood reflection, spotlight beams, crowd silhouette",
  tennis:
    "tennis court (clay/grass/hard depending on tournament), stadium stands, atmospheric depth",
  boxing: "boxing ring ropes silhouette, dark arena, single spotlight, smoke haze, sparks",
  mma: "MMA octagon silhouette, dark arena, single spotlight, smoke, sparks",
  hockey: "ice rink with frost particles, arena boards, blue ice glow, cold atmospheric mist",
  baseball: "baseball diamond, stadium lights, dusk sky",
  american_football: "NFL-style stadium, end zone lights, atmospheric haze",
  esports:
    "dark esports arena with massive LED screens, neon RGB lighting, stage smoke, holographic UI elements",
  f1: "racetrack with motion-blurred lights, pit lane atmosphere, speed streaks",
  rugby: "rugby field with stadium floodlights, atmospheric depth",
  cricket: "cricket field with stadium floodlights, atmospheric depth",
  badminton: "indoor sports hall, spotlight, net silhouette",
  volleyball: "indoor volleyball hall, spotlight, net silhouette",
  other: "generic dramatic sports arena atmosphere, floodlights, smoke, particles",
};

const SPORT_LABEL: Record<string, string> = {
  football: "Football (Soccer)",
  basketball: "Basketball",
  tennis: "Tennis",
  boxing: "Boxing",
  mma: "MMA / UFC",
  hockey: "Hockey",
  baseball: "Baseball",
  american_football: "American Football",
  esports: "Esports",
  f1: "Formula 1",
  rugby: "Rugby",
  cricket: "Cricket",
  badminton: "Badminton",
  volleyball: "Volleyball",
  other: "Sports",
};

function sportPrompt(args: {
  subject: string;
  aspectRatio: string;
  language: string;
  brandName: string;
  hasBrandLogo: boolean;
  sportType: string;
  matchType: string; // national | clubs | individual | auto
  sideAName: string;
  sideBName: string;
  hasSideALogo: boolean;
  hasSideBLogo: boolean;
  eventName: string;
  matchDatetime: string;
  location: string;
  personEnabled: boolean;
  headlineEnabled: boolean;
  headlineText: string;
  ctaEnabled: boolean;
  ctaText: string;
  subheadlineEnabled: boolean;
  subheadlineText: string;
  bonusEnabled: boolean;
  bonusText: string;
  playersEnabled: boolean;
  sideAPlayers: string;
  sideBPlayers: string;
}): string {
  const {
    subject,
    aspectRatio,
    language,
    brandName,
    hasBrandLogo,
    sportType,
    matchType,
    sideAName,
    sideBName,
    hasSideALogo,
    hasSideBLogo,
    eventName,
    matchDatetime,
    location,
    personEnabled,
    headlineEnabled,
    headlineText,
    ctaEnabled,
    ctaText,
    subheadlineEnabled,
    subheadlineText,
    bonusEnabled,
    bonusText,
    playersEnabled,
    sideAPlayers,
    sideBPlayers,
  } = args;

  const [w, h] = aspectRatio.split(":").map(Number);
  const isHorizontal = !!(w && h && w > h);
  const isSquare = !!(w && h && Math.abs(w / h - 1) < 0.05);
  const langLabel = LANG_LABELS[language] || "the most natural language for the brand";
  const logoPos = isHorizontal ? "TOP-LEFT" : "TOP-CENTER";

  const layout = isHorizontal
    ? "Wide cinematic face-off layout. Two subjects mirrored left and right facing center. Event title and date centered horizontally in upper-third or lower-third. Sportsbook logo top-left. CTA bottom-center. Bonus overlay as a corner badge. Keep faces, crests and text within 5–8% safe margins."
    : isSquare
      ? "Centered face-off layout. Two subjects flanking center with a bold VS divider. Event title centered top or behind subjects. CTA centered bottom. Logo top-center. Balanced symmetric composition."
      : "Vertical poster layout. Subjects stacked or shoulder-to-shoulder filling the upper two-thirds of the frame. Event title and date in the bottom third. Sportsbook logo top-center. CTA bottom-center. Bonus badge as a small floating element. Classic fight-poster vertical composition.";

  const lines: string[] = [];
  lines.push(`Create a premium sports betting promotional banner in ${aspectRatio} format.`);
  lines.push(`CORE BRIEF: ${subject}`);

  if (sportType) {
    const label = SPORT_LABEL[sportType] || sportType;
    const bg = SPORT_BG[sportType] || SPORT_BG.other;
    lines.push(`SPORT: ${label}`);
    lines.push(`BACKGROUND ENVIRONMENT: ${bg}.`);
  } else {
    lines.push(
      "SPORT: infer from the core brief / team names. BACKGROUND ENVIRONMENT: cinematic sports arena atmosphere appropriate to the inferred sport, with floodlights, smoke, particles.",
    );
  }

  if (sideAName || sideBName) {
    lines.push(`MATCHUP: ${sideAName || "Side A"} VS ${sideBName || "Side B"}`);
  }

  const effectiveMatchType = matchType || "auto";
  const kitFor = (side: string) => {
    if (effectiveMatchType === "national") return `${side} national team kit`;
    if (effectiveMatchType === "clubs") return `${side} club kit`;
    if (effectiveMatchType === "individual") return `${side}'s individual sport gear`;
    return `${side}'s correct team/national/individual kit`;
  };

  if (!playersEnabled) {
    lines.push(
      "COMPOSITION: No human figures on the banner. Build the entire composition around team symbolism — large stylized crests, national flags as dramatic drapes, sport equipment as hero subjects (ball, gloves, trophy, helmet, racket), tournament symbol as central focus. Dramatic lighting, particles, sparks, arena atmosphere. The matchup energy is conveyed through symbolic clash of emblems, not faces.",
    );
  } else {
    const sideALabel = sideAName || "Side A";
    const sideBLabel = sideBName || "Side B";
    if (!sideAPlayers && !sideBPlayers) {
      lines.push(
        `HUMAN SUBJECTS — AUTO MODE:\n- LEFT side: generate a generic stylized star athlete figure representing ${sideALabel}. Match the athletic archetype typical for ${sportType || "the inferred sport"} and the role of a top-tier player. Wear ${kitFor(sideALabel)} correctly with proper crest placement. Non-identifiable face — do NOT depict any specific real, named athlete. The figure should feel like an iconic anonymous superstar of that team.\n- RIGHT side: same approach for ${sideBLabel}. Generic stylized star athlete in ${kitFor(sideBLabel)}, non-identifiable face, archetype matching the sport.`,
      );
    } else {
      const aRef = sideAPlayers || `top star of ${sideALabel}`;
      const bRef = sideBPlayers || `top star of ${sideBLabel}`;
      lines.push(
        `HUMAN SUBJECTS — USER-SPECIFIED:\n- LEFT side: athlete(s) inspired by "${aRef}". Render stylized portrait(s) wearing ${kitFor(sideALabel)}. Match the general physical archetype, build, hair, and skin tone associated with the named athlete(s), but render the face in a stylized, illustrated, non-photorealistic manner — avoid attempting an exact photorealistic likeness of the real person. Treat the names as artistic inspiration for the archetype, not as photographic reference.\n- RIGHT side: same approach for "${bRef}" in ${kitFor(sideBLabel)}.\n\nIf multiple players are listed per side (comma-separated), arrange them in a hero group shot — main player as central focus, secondary players flanking slightly behind with strong rim lighting (similar to Liverpool LFC-style hero squad poster).`,
      );
    }
    lines.push(
      "LAYOUT ADAPTATION BY PLAYER COUNT:\n- 1 player per side → classic face-off split-screen (two large portraits facing center).\n- 2 players per side → tight duo composition per side, slightly staggered depth.\n- 3+ players per side → squad layout, central hero player one step forward, teammates flanking behind in fan formation, dramatic backlight separating layers.",
    );
  }

  if (eventName)
    lines.push(
      `EVENT TITLE: "${eventName}" prominently displayed in bold premium sports typography.`,
    );
  if (matchDatetime)
    lines.push(`DATE OVERLAY: "${matchDatetime}" styled as bold tournament-poster text.`);
  if (location)
    lines.push(`LOCATION: subtle silhouette of ${location} stadium/arena in the deep background.`);

  lines.push(
    "VISUAL STYLE: Premium sports promotional poster aesthetic. Cinematic, dramatic, high contrast, gritty textures, rim lighting, atmospheric haze, sparks, dust particles, light rays, intense energy. Inspired by championship fight posters, Champions League promos, UFC fight cards and esports finals graphics.",
  );
  lines.push(`LAYOUT: ${layout}`);

  const isSpecificLang = language && language !== "auto" && LANG_LABELS[language];
  const renderInstr = (txt: string) =>
    isSpecificLang
      ? `rendered in ${langLabel}; if "${txt}" is in a different language, translate it accurately into ${langLabel} before rendering (do NOT keep the source language)`
      : `appearing as: "${txt}"`;
  const textLines: string[] = [
    `TEXT BLOCK (all in-image text MUST be in ${langLabel}${isSpecificLang ? "; translate any source-language text into " + langLabel : ""}; EXCEPTION: sportsbook brand logos and team crests/flags/emblems must be kept exactly as-is in their original language and lettering — NEVER translate or relocalize any text that is part of a logo):`,
  ];
  if (headlineEnabled) {
    if (headlineText)
      textLines.push(
        `- Headline: "${headlineText}" — ${renderInstr(headlineText)}, large and bold.`,
      );
    else
      textLines.push(
        `- Headline: generate a powerful short sports-poster headline in ${langLabel} (e.g. "MATCH DAY", "WINNER TAKES ALL", "UNDISPUTED").`,
      );
  } else {
    textLines.push("- Headline: none.");
  }
  if (subheadlineEnabled) {
    if (subheadlineText)
      textLines.push(`- Subtext: "${subheadlineText}" — ${renderInstr(subheadlineText)}.`);
    else
      textLines.push(
        `- Subtext: generate a short supporting line in ${langLabel} (e.g. "Super Welterweight Championship", "Winner Takes All").`,
      );
  } else {
    textLines.push("- Subtext: none.");
  }
  if (ctaEnabled) {
    if (ctaText)
      textLines.push(
        `- CTA: "${ctaText}" — ${renderInstr(ctaText)}, bold pill button, accent color, glowing.`,
      );
    else
      textLines.push(
        `- CTA: generate a short betting CTA in ${langLabel} (e.g. "BET NOW", "PLACE BET", "BOOST ODDS"), bold pill button, accent color, glowing.`,
      );
  } else {
    textLines.push("- CTA: none.");
  }
  lines.push(textLines.join("\n"));

  if (bonusEnabled && bonusText) {
    lines.push(
      `PROMO OVERLAY: Include a bold promotional badge/banner with "${bonusText}" — styled as a betting odds boost or bonus offer, contrasting accent color, must look like a premium sportsbook offer.`,
    );
  }

  if (hasBrandLogo) {
    lines.push(
      `SPORTSBOOK BRAND: Place the provided ${brandName ? `"${brandName}" ` : ""}brand logo at ${logoPos} discreetly, reproduced exactly. Color palette should harmonize brand identity with team/sport colors.`,
    );
  } else {
    lines.push(
      "SPORTSBOOK BRAND: No brand logo provided — do NOT invent, draw, or render any sportsbook brand logo, wordmark, or emblem. The brand name may appear only as plain typographic text if needed, never stylized as a logo.",
    );
  }

  lines.push(
    "COLOR RULES:\n- Dominant palette derived from team/national colors split between sides.\n- Strong color contrast between left and right side (warm vs cool typical for face-off posters).\n- Brand sportsbook color used as accent for CTA and bonus overlay only.\n- 2–3 dominant colors maximum per side.",
  );

  lines.push(
    "AVOID: generic stock-photo look, weak contrast, overcrowded composition, logos overlapping faces, mismatched team kits, more than 3 dominant colors per side.",
  );

  lines.push(
    "IMPORTANT — LIKENESS POLICY:\nDo NOT generate photorealistic, identifiable likenesses of real named athletes. When user provides specific player names, treat them only as inspiration for athletic archetype (build, skin tone, hair style, general look) and render in a stylized, slightly illustrated, non-photographic manner that clearly does not impersonate the real individual. The kit, crest, and team colors must be accurate; the face must be original and stylized. This keeps the banner brand-safe for sportsbook commercial use.",
  );

  if (hasSideALogo || hasSideBLogo) {
    const parts: string[] = [];
    if (hasSideALogo) parts.push(`the LEFT side crest/flag of ${sideAName || "Side A"}`);
    if (hasSideBLogo) parts.push(`the RIGHT side crest/flag of ${sideBName || "Side B"}`);
    lines.push(
      `REFERENCE LOGOS: Reproduce the attached side logos exactly (shape, proportions, colors) — they represent ${parts.join(" and ")}. Do not redesign them.`,
    );
  }

  return lines.join("\n\n");
}

async function adaptPrompt(
  apiKey: string,
  template: string,
  subject: string,
  bannerText: string,
  buttonText: string,
  adTextsEnabled: boolean,
  personEnabled: boolean,
  personGender: "female" | "male" | null,
  aspectRatio: string,
  brandName: string,
  hasLogo: boolean,
  language: string,
): Promise<string> {
  const orientation =
    aspectRatio === "1:1"
      ? "square"
      : (() => {
          const [w, h] = aspectRatio.split(":").map(Number);
          return w > h ? "landscape (horizontal)" : "portrait (vertical)";
        })();
  const system =
    "You are an expert prompt engineer for commercial image generation. " +
    "You receive a TEMPLATE prompt that describes a visual style, composition, lighting, " +
    "typography and layout for a product/service ad. Rewrite the template so it advertises the NEW SUBJECT, " +
    "keeping the exact same visual style, composition logic, camera, lighting, color treatment and layout zones. " +
    "Replace product-specific details (object held in hand, product name, headline, feature line, big NUMBERS with units, " +
    "model's clothing/hair, background mood) with details that make sense for the new subject and brand. " +
    "All in-image marketing texts (headline, product name, feature line, NUMBERS captions) MUST be written in the natural " +
    "language of the brand/subject (e.g. for Ukrainian brands like Моршинська → Ukrainian; for Russian brands → Russian; " +
    "for international/English brands → English). Keep them short, punchy and commercially relevant. " +
    "STRICT REQUIREMENTS that override the template:\n" +
    "- AD_TEXTS flag: if OFF, remove ALL marketing copy from the scene — no headline, no product name, no feature lines, " +
    "no big numbers with captions, no callouts. Keep only the visual scene (product, optional person, background, lighting, " +
    "composition, style). The image must contain NO rendered text except the banner/CTA texts explicitly provided below.\n" +
    "- PERSON flag: if OFF, do NOT include any person, model, or face. Hands holding the product are still allowed. " +
    "Recompose so the product itself is the hero. If ON, the central subject is a model of the specified gender; " +
    "adapt clothing, hair, styling so they fit the gender and the brand.\n" +
    "- If a BANNER HEADLINE TEXT is provided, it MUST appear as the main headline in the image " +
    "(even when AD_TEXTS is OFF). If an explicit OUTPUT LANGUAGE is specified and the provided headline is in a different language, " +
    "TRANSLATE it accurately into the OUTPUT LANGUAGE before rendering — do NOT keep the source-language wording. " +
    "If OUTPUT LANGUAGE is auto, render the headline verbatim.\n" +
    "- If a CTA BUTTON TEXT is provided, add a clearly described call-to-action button with that text " +
    "(even when AD_TEXTS is OFF). Apply the same translation rule: when OUTPUT LANGUAGE is specified, translate the CTA into it; " +
    "when auto, keep it verbatim.\n" +
    "Return ONLY the final image-generation prompt as a single paragraph in English, no preface, no markdown.";

  const personLine = personEnabled
    ? `PERSON: ON — central subject is a ${personGender === "male" ? "male" : "female"} model.`
    : "PERSON: OFF — no person, model, or face in the scene. Hands are allowed.";
  const adTextsLine = adTextsEnabled
    ? "AD_TEXTS: ON — keep all template marketing texts (adapted to the new subject and its language)."
    : "AD_TEXTS: OFF — remove all marketing texts. The image must contain no rendered text except the explicit banner/CTA below.";

  const langLabel = LANG_LABELS[language] || "";
  const languageLine = langLabel
    ? `OUTPUT LANGUAGE: All in-image rendered texts (headline, product name, feature lines, numbers captions, CTA) MUST be written in ${langLabel}. Override any brand-language inference. EXCEPTION: brand logos, wordmarks and emblems must be reproduced exactly as-is in their original language and lettering — NEVER translate or relocalize any text that is part of a logo.`
    : "OUTPUT LANGUAGE: auto-detect from the brand/subject as instructed in the system message. Brand logos and wordmarks must always be kept exactly as-is — never translate logo text.";
  const brandLine = brandName
    ? `BRAND NAME: "${brandName}". Treat this as the brand for which the banner is created. Use it consistently where a brand name appears.`
    : "";
  const logoLine = hasLogo
    ? `BRAND LOGO: a logo is provided by the brand. Include a small, clean brand mark / wordmark in a corner (top-left or top-right) that visually represents the brand "${brandName || "the brand"}". Keep it understated and on-brand.`
    : `BRAND LOGO: No brand logo provided — do NOT invent, draw, or render any brand logo, wordmark, emblem, or brand mark anywhere in the image. The brand name may appear only as plain typographic text if explicitly required, never stylized as a logo.`;

  const userParts = [
    `TEMPLATE:\n${template}`,
    `NEW SUBJECT (what the banner is about):\n${subject}`,
    `OUTPUT ASPECT RATIO: ${aspectRatio} (${orientation}). Compose the scene, framing, subject placement and text layout so they read naturally at this exact ratio. Do not describe a square composition when the ratio is non-square.`,
    languageLine,
    brandLine,
    logoLine,
    adTextsLine,
    personLine,
    bannerText ? `REQUIRED BANNER HEADLINE TEXT (verbatim): "${bannerText}"` : "",
    buttonText ? `REQUIRED CTA BUTTON TEXT (verbatim): "${buttonText}"` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // adaptPrompt uses gpt-4o-mini via OpenAI direct (same key as image gen).
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userParts },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI chat ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("Empty adapted prompt");
  return out;
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Correlation id stitched through every log row this handler
        // emits — makes /admin → Логи trivial to follow request-by-request.
        const requestId = newRequestId();
        const requestStartedAt = Date.now();

        // ---- Auth & balance pre-flight ----
        let authedUser: Awaited<ReturnType<typeof requireUser>>;
        try {
          authedUser = await requireUser(request);
        } catch (err) {
          return authErrorResponse(err);
        }

        const genRl = rateLimitResponse("generate-image", authedUser.id, 30, 60_000);
        if (genRl) return genRl;

        const supa = getAdminClient();
        const { data: profileRow, error: profileErr } = await supa
          .from("profiles")
          .select("credits_balance")
          .eq("id", authedUser.id)
          .single();
        if (profileErr || !profileRow) {
          console.error("generate-image: profile lookup failed", profileErr);
          return Response.json({ error: "Profile not found" }, { status: 404 });
        }
        const balanceBefore = Number(profileRow.credits_balance ?? 0);
        if (balanceBefore < MIN_BALANCE_TO_GENERATE) {
          return Response.json(
            { error: "insufficient_credits", balance: balanceBefore },
            { status: 402 },
          );
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
        }

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        // OOM guard (SEC-H4): reject oversized inbound image fields before
        // any base64 decode.
        for (const f of [
          "brand_logo",
          "slot_screenshot",
          "slot_logo",
          "side_a_logo",
          "side_b_logo",
          "source_image",
        ] as const) {
          const v = (body as Record<string, unknown>)[f];
          if (
            typeof v === "string" &&
            v.startsWith("data:") &&
            dataUrlByteLength(v) > MAX_DATAURL_BYTES
          ) {
            return Response.json({ error: `${f} too large` }, { status: 413 });
          }
        }

        // Resize batches initiated from a history-loaded master pass an
        // FTP URL in `source_image` rather than a base64 dataURL (the
        // master image bytes only ever existed as dataURL in the
        // browser; from history we have the URL). Materialise it into a
        // dataURL so the downstream `hasSourceImage` checks and the
        // refs list treat it identically to a freshly-generated master.
        // Without this fix, the master reference silently dropped and
        // every i2i resize was generated from scratch — visually
        // unrelated to the master.
        if (
          body.source_image &&
          (body.source_image.startsWith("http://") || body.source_image.startsWith("https://"))
        ) {
          try {
            const { buffer, mime } = await safeFetchImage(body.source_image);
            const b64 = buffer.toString("base64");
            body = { ...body, source_image: `data:${mime};base64,${b64}` };
          } catch (e) {
            // SSRF-blocked or fetch failure → drop the reference and
            // continue (the i2i path degrades to t2i rather than fetching
            // an untrusted URL).
            console.warn("source_image URL fetch skipped", e);
            body = { ...body, source_image: undefined };
          }
        }

        const subject = (body.subject || body.prompt || "").trim();
        const template = body.template?.trim() || "";
        const bannerText = (body.banner_text || "").trim();
        const buttonText = (body.button_text || "").trim();
        const adTextsEnabled = body.ad_texts_enabled !== false;
        const personEnabled = body.person_enabled !== false;
        const personGender: "female" | "male" | null = personEnabled
          ? body.person_gender === "male"
            ? "male"
            : "female"
          : null;
        const brandName = (body.brand_name || "").trim().slice(0, 80);
        const hasLogo = !!(body.brand_logo && body.brand_logo.startsWith("data:"));
        const language = (body.language || "auto").trim();
        const slotName = (body.slot_name || "").trim().slice(0, 120);
        const hasSlotScreenshot = !!(
          body.slot_screenshot && body.slot_screenshot.startsWith("data:")
        );
        const hasSlotLogo = !!(body.slot_logo && body.slot_logo.startsWith("data:"));
        const presetId = (body.preset_id || "").trim();
        const quality: "low" | "medium" | "high" =
          body.quality === "high" ? "high" : body.quality === "medium" ? "medium" : "low";
        const isEventPreset = presetId === "preset3" || template === "EVENT_PRESET";
        const eventText = (body.event_text || "").trim().slice(0, 200);
        const subheadlineText = (body.subheadline_text || "").trim().slice(0, 300);
        const subheadlineEnabled = !!body.subheadline_enabled;
        const isSportPreset = presetId === "preset4" || template === "SPORT_PRESET";
        const sportType = (body.sport_type || "").trim().slice(0, 40);
        const matchType = (body.match_type || "").trim().slice(0, 40);
        const sideAName = (body.side_a_name || "").trim().slice(0, 80);
        const sideBName = (body.side_b_name || "").trim().slice(0, 80);
        const hasSideALogo = !!(body.side_a_logo && body.side_a_logo.startsWith("data:"));
        const hasSideBLogo = !!(body.side_b_logo && body.side_b_logo.startsWith("data:"));
        const eventName = (body.event_name || "").trim().slice(0, 120);
        const matchDatetime = (body.match_datetime || "").trim().slice(0, 80);
        const location = (body.location || "").trim().slice(0, 120);
        const bonusText = (body.bonus_text || "").trim().slice(0, 200);
        const bonusEnabled = !!body.bonus_enabled;
        // Resize-batch source. When present, this turns the request into an
        // adaptation of an existing banner — subject becomes optional.
        const hasSourceImage = !!(body.source_image && body.source_image.startsWith("data:"));

        const effectiveSubject = subject || slotName;

        // subject is normally required, but source_image-driven adaptations
        // can rely on the master banner alone (and an optional aspect hint).
        if (!effectiveSubject && !template && !hasSourceImage) {
          return Response.json({ error: "subject is required" }, { status: 400 });
        }
        if (effectiveSubject.length > 2000) {
          return Response.json({ error: "subject too long" }, { status: 400 });
        }

        let finalPrompt: string;
        try {
          if (isSportPreset) {
            finalPrompt = sportPrompt({
              subject: effectiveSubject,
              aspectRatio: body.aspect_ratio || "1:1",
              language,
              brandName,
              hasBrandLogo: hasLogo,
              sportType,
              matchType,
              sideAName,
              sideBName,
              hasSideALogo,
              hasSideBLogo,
              eventName,
              matchDatetime,
              location,
              personEnabled,
              headlineEnabled: body.banner_text_enabled === true,
              headlineText: bannerText,
              ctaEnabled: body.button_text_enabled === true,
              ctaText: buttonText,
              subheadlineEnabled,
              subheadlineText,
              bonusEnabled,
              bonusText,
              playersEnabled: body.players_enabled !== false,
              sideAPlayers: (body.side_a_players || "").trim().slice(0, 200),
              sideBPlayers: (body.side_b_players || "").trim().slice(0, 200),
            });
          } else if (isEventPreset) {
            finalPrompt = eventPrompt({
              subject: effectiveSubject,
              aspectRatio: body.aspect_ratio || "1:1",
              language,
              brandName,
              hasLogo,
              eventText,
              personEnabled,
              personGender,
              adTextsEnabled,
              headlineEnabled: body.banner_text_enabled === true,
              headlineText: bannerText,
              ctaEnabled: body.button_text_enabled === true,
              ctaText: buttonText,
              subheadlineEnabled,
              subheadlineText,
            });
          } else if (hasSlotScreenshot || hasSlotLogo || slotName) {
            finalPrompt = slotPrompt(
              slotName,
              bannerText,
              buttonText,
              body.aspect_ratio || "1:1",
              language,
              hasSlotScreenshot,
              hasSlotLogo || hasLogo,
            );
          } else if (template) {
            finalPrompt = await adaptPrompt(
              apiKey,
              template,
              effectiveSubject || "the product",
              bannerText,
              buttonText,
              adTextsEnabled,
              personEnabled,
              personGender,
              body.aspect_ratio || "1:1",
              brandName,
              hasLogo || hasSlotLogo,
              language,
            );
          } else {
            finalPrompt = effectiveSubject;
            if (!personEnabled)
              finalPrompt +=
                " Do not include any person, model, or face; hands are allowed. Focus on the product.";
            if (!adTextsEnabled)
              finalPrompt += " The image must contain no marketing text or callouts.";
            if (brandName) finalPrompt += ` Brand: "${brandName}".`;
            if (hasLogo)
              finalPrompt += ` Include a small clean brand wordmark for "${brandName || "the brand"}" in a corner.`;
            if (LANG_LABELS[language])
              finalPrompt += ` All in-image texts must be written in ${LANG_LABELS[language]}.`;
            if (bannerText) finalPrompt += ` Use the exact banner headline text: "${bannerText}".`;
            if (buttonText)
              finalPrompt += ` Include a clear call-to-action button with the exact text: "${buttonText}".`;
          }
        } catch (e) {
          console.error("adaptPrompt failed", e);
          return Response.json(
            {
              error: "Prompt adaptation failed",
              detail: e instanceof Error ? e.message : String(e),
            },
            { status: 502 },
          );
        }

        // Belt-and-suspenders TEXT FIDELITY block — applied to EVERY
        // master generation across all 4 presets (Wide-angle / Slot /
        // Event / Sport). Picks up every user-provided text field from
        // body, attaches a universal length/content guard ("N characters
        // total, render character-for-character"), and forbids the model
        // from adding text it wasn't given.
        //
        // The reason this lives here, after the preset builders, is that
        // preset prompts can re-word or drop fields when they pass
        // through adaptPrompt's gpt-4o-mini rewrite. This block executes
        // unconditionally as the final word in the prompt.
        const fidelityLengthHint = (t: string): string => {
          const chars = [...t].length;
          const digits = (t.match(/\d/g) ?? []).length;
          const parts = [`${chars} character${chars === 1 ? "" : "s"} total`];
          if (digits > 0) parts.push(`including ${digits} digit${digits === 1 ? "" : "s"}`);
          return ` ← ${parts.join(", ")}. Render this string EXACTLY character-for-character — same length, same characters, same order. Do not add, drop, repeat, translate or rearrange anything.`;
        };

        const fidelityItems: string[] = [];
        const pushFidelity = (label: string, text: string) => {
          const v = (text || "").trim();
          if (!v) return;
          fidelityItems.push(`  • ${label}: "${v}"${fidelityLengthHint(v)}`);
        };

        // Common fields across all presets:
        if (body.banner_text_enabled === true) pushFidelity("HEADLINE", bannerText);
        if (body.button_text_enabled === true) pushFidelity("CTA BUTTON", buttonText);
        if (subheadlineEnabled) pushFidelity("SUBHEADLINE", subheadlineText);
        if (brandName) pushFidelity("BRAND NAME", brandName);

        // Preset-specific text fields:
        // Slot preset is detected by presence of slot-related inputs
        // (mirrors the if-chain that picked slotPrompt above).
        const isSlotPresetEffective = hasSlotScreenshot || hasSlotLogo || Boolean(slotName);
        if (isSlotPresetEffective) {
          pushFidelity("SLOT NAME", slotName);
        }
        if (isEventPreset) {
          pushFidelity("EVENT TEXT", eventText);
        }
        if (isSportPreset) {
          pushFidelity("EVENT NAME", eventName);
          pushFidelity("SIDE A NAME", sideAName);
          pushFidelity("SIDE B NAME", sideBName);
          pushFidelity("MATCH DATETIME", matchDatetime);
          pushFidelity("LOCATION", location);
          if (bonusEnabled) pushFidelity("BONUS TEXT", bonusText);
        }

        if (fidelityItems.length > 0) {
          finalPrompt = [
            finalPrompt,
            "",
            "===== TEXT FIDELITY — USER-PROVIDED STRINGS (HIGHEST PRIORITY) =====",
            "These are the ONLY texts permitted to appear as rendered words/numbers on the image. Render each one VERBATIM. Do not invent additional headlines, badges, taglines, numbers, dates, names or any other text.",
            "",
            ...fidelityItems,
          ].join("\n");
        }

        // ----------------------------------------------------------------
        // SUPERSEDING SAFE-ZONE — prepended to the START of every master
        // prompt with explicit override language. Models weight the
        // first and last sections of long prompts most heavily, so we
        // duplicate the safe-zone rule at the head to overpower preset
        // builders that say things like "headline top-right corner",
        // which historically caused critical text to land in the
        // outer-20% ring and get chopped by downstream resizes.
        if (!hasSourceImage) {
          finalPrompt = [
            "===== SUPERSEDING COMPOSITION RULE (PRIORITY 0 — overrides EVERY positioning instruction below) =====",
            "All critical visual elements — every text, every number, every digit, every brand logo / wordmark, the central object, the person's face, the CTA button, badges — MUST sit inside the CENTRAL 60% × 60% of the output canvas (between 20% and 80% on both axes).",
            "The OUTER 20% ring on every side is reserved EXCLUSIVELY for atmospheric background (sky, blur, lens flares, particles, decorations).",
            "If any rule, preset hint or composition example BELOW asks you to place something in a corner, on an edge, near a side, or close to a margin — IGNORE THAT instruction and move the element into the central 60% × 60% zone instead. This rule supersedes ALL conflicting placement guidance in the rest of this prompt.",
            "",
            finalPrompt,
          ].join("\n");
        }

        // ----------------------------------------------------------------
        // MASTER COMPOSITION RULES — applied to fresh generations (NOT
        // resizes; resize has its own crop-aware wrap below).
        //
        // gpt-image-1 tends to:
        //   (a) place CTA buttons and important text touching the canvas
        //       edge unless told otherwise;
        //   (b) invent extra headlines / numbers / badges when the brief
        //       mentions abstract concepts (especially with non-English
        //       prompts), and then render that invented text as gibberish
        //       Cyrillic / Latin mashups.
        // The block below addresses both: enforces a hard safe margin
        // and forbids inventing any text not explicitly listed.
        // ----------------------------------------------------------------
        if (!hasSourceImage) {
          const allowedTexts: string[] = [];
          if (body.banner_text_enabled === true && bannerText) allowedTexts.push(`"${bannerText}"`);
          if (body.button_text_enabled === true && buttonText) allowedTexts.push(`"${buttonText}"`);
          if (subheadlineEnabled && subheadlineText) allowedTexts.push(`"${subheadlineText}"`);
          if (brandName) allowedTexts.push(`brand name "${brandName}"`);
          if (eventName) allowedTexts.push(`event name "${eventName}"`);
          if (bonusEnabled && bonusText) allowedTexts.push(`"${bonusText}"`);

          const allowedTextLine =
            allowedTexts.length > 0
              ? `ALLOWED TEXT ELEMENTS — the ONLY readable text/numbers permitted on this image: ${allowedTexts.join(", ")}. Do not add any other text, numbers, statistics, badges, taglines, dates or captions.`
              : "NO TEXT — the user did not provide any banner text or CTA text. Produce a fully visual banner with ZERO readable text overlays. Do not invent text, do not add headlines, do not add numbers, do not add badges. The image must be text-free.";

          finalPrompt = [
            finalPrompt,
            "",
            "===== MASTER COMPOSITION RULES (PRIORITY 1) =====",
            "MULTI-ASPECT SAFE ZONE — this banner will later be cropped and resized into multiple aspect ratios (Stories 9:16, YouTube 16:9, social posts 1:1 / 4:5, web banners, Pinterest 3:4, etc.). EVERY critical element MUST live inside the CENTRAL 60% × 60% region of your output canvas — that means from 20% to 80% horizontally AND from 20% to 80% vertically.",
            "Critical elements include: every readable text, every number, every digit, every brand logo / wordmark, the central object (card / cup / chip / product / etc.), the person's face, the CTA button, badges.",
            "OUTSIDE the central 60% (the outer 20% ring on every side) only ATMOSPHERIC BACKGROUND is allowed: sky, blur, lens flares, particles, decorative motifs that may be cropped without losing meaning.",
            "PIXEL-EXPLICIT SAFE MARGIN scales with your output resolution — translate the 20% rule into actual pixels for the canvas you're producing. Examples: on a 1024×1024 canvas → ≥ 200 pixels from each edge; on a 1536×1024 → ≥ 300 horizontal / 200 vertical; on a 1024×1536 → ≥ 200 horizontal / 300 vertical.",
            "BUTTON RULE: if a CTA button is rendered, place it inside the central safe area, with at least 12% of the canvas height between the button and the bottom edge.",
            "TEXT-LANGUAGE RULE: any text inside the image must be spelled CORRECTLY in the target language. Do NOT invent fake words, scrambled Cyrillic/Latin letters or pseudo-text. If you cannot render a word legibly, omit it entirely rather than rendering gibberish.",
            "ANTI-CLUTTER RULE: " + allowedTextLine,
          ].join("\n");
        }

        // Resize-batch wrap: when a master banner is attached, the
        // model is producing for a DOWNSTREAM CROP. We tell it the exact
        // final dimensions and ask for a crop-safe composition — i.e.
        // everything important lives inside the central safe zone, text
        // is smaller, edges are sacrificable. This is the production
        // technique used by Bannerbear / Adobe Express for adaptive
        // banner pipelines.
        if (hasSourceImage) {
          const targetRatio = body.aspect_ratio || "1:1";
          // Compute the ACTUAL canvas size the model will draw on (same
          // value we'll later send as `size=` to OpenAI). It's the
          // bucket source size — at-or-above the largest tile in this
          // bucket, exact target aspect, both edges /16. The prompt
          // tells the model these exact pixel dimensions so it composes
          // for the right canvas. The user's target_w/target_h are kept
          // for reference but the model designs for canvas dimensions.
          const reqTargetW = Number(body.target_w) || 0;
          const reqTargetH = Number(body.target_h) || 0;
          const computedSize = openAiSizeFor(targetRatio, reqTargetW, reqTargetH);
          const [csW, csH] = computedSize.split("x").map(Number);
          const targetW = csW || reqTargetW;
          const targetH = csH || reqTargetH;
          const hasPixelTarget = targetW > 0 && targetH > 0;

          const [aw, ah] = targetRatio.split(":").map(Number);
          const orientation =
            aw && ah
              ? aw > ah * 1.1
                ? "landscape (horizontal)"
                : ah > aw * 1.1
                  ? "portrait (vertical)"
                  : "square / near-square"
              : "square / near-square";
          // Prefer a per-use-case template (stories / youtube / pinterest /
          // social-posts / web-* / tiny) over the generic orientation hint.
          // The template is matched to the SPECIFIC platform the resize
          // tile is destined for, so the model gets the layout convention
          // used by that platform's UI, not a generic portrait/landscape
          // sketch.
          const groupTemplate = getGroupTemplate(body.group_id);
          const layoutHint =
            groupTemplate?.layout ??
            (orientation === "portrait (vertical)"
              ? "Stack elements vertically: small logo at the top, headline below, then the key visual occupying the central ~45–55% of the height, then supporting text and CTA stacked toward the bottom. Every text block sits well inside a tight central column — NEVER extends close to the left or right edges."
              : orientation === "landscape (horizontal)"
                ? "Use a horizontal layout: logo, headline, supporting text and CTA on one side, key visual on the other. Keep every text block clear of the top and bottom edges by ≥10% of the height. NEVER extend text close to the top or bottom edges."
                : "Centered balanced layout: logo top, key visual centered, headline and supporting text around the key visual, CTA bottom. Generous margins on all sides.");

          // Build MASTER VISUAL FACTS block from the vision pre-pass.
          // This is the strongest signal we can give the model — explicit
          // OCR'd text and a named object that come from looking at the
          // actual master, not from interpreting the brief.
          //
          // For every text token we additionally:
          //  • count its digits, and demand the same digit count be
          //    rendered (kills the "1222211212 → 12222112121212" drift);
          //  • forward an approximate position label so the model places
          //    elements similarly to the master's composition.
          const md = body.master_details;
          const visualFactsLines: string[] = [];
          // Universal length/content guard for ANY text token. Works on
          // arbitrary Russian / English / numbers / mixed strings. The
          // model gets explicit character and digit counts plus a "no
          // more, no less" rule, which prevents both
          //   • digit drift (1222211212 → 12222112121212)
          //   • word drift  (truncations, paraphrases, extra words)
          // [...t].length counts characters in a code-point-correct way
          // for Cyrillic + emoji.
          const lengthHint = (t: string): string => {
            const chars = [...t].length;
            const digits = (t.match(/\d/g) ?? []).length;
            const parts = [`${chars} character${chars === 1 ? "" : "s"} total`];
            if (digits > 0) parts.push(`including ${digits} digit${digits === 1 ? "" : "s"}`);
            return ` ← ${parts.join(", ")}. Render this string EXACTLY character-for-character — same length, same characters, same order. Do not add, drop, repeat or rearrange anything.`;
          };
          if (md) {
            if (md.central_object) {
              visualFactsLines.push(
                `CENTRAL OBJECT: ${md.central_object}. This is the only valid choice — do not substitute any other object type.`,
              );
            }
            if (md.central_object_texts && md.central_object_texts.length > 0) {
              visualFactsLines.push(
                "TEXTS PRINTED ON THE CENTRAL OBJECT — render ALL of these on the object EXACTLY (character-for-character, same writing system, same order). Do not skip any item, do not invent additional ones:",
                ...md.central_object_texts.map((t) => `  • "${t}"${lengthHint(t)}`),
              );
            }
            if (md.person) {
              visualFactsLines.push(`PERSON: ${md.person}`);
            }
            if (md.scene) {
              visualFactsLines.push(`SCENE / BACKGROUND: ${md.scene}`);
            }
            if (md.colors && md.colors.length > 0) {
              visualFactsLines.push(`COLOR PALETTE: ${md.colors.join(", ")}.`);
            }
            if (md.style) {
              visualFactsLines.push(`VISUAL STYLE: ${md.style}`);
            }
            if (md.banner_texts && md.banner_texts.length > 0) {
              const items = md.banner_texts.map((b) =>
                typeof b === "string" ? { text: b, position: "" } : b,
              );
              visualFactsLines.push(
                "TEXTS ON THE BANNER (outside the central object) — render ALL of these EXACTLY. Each item below carries the approximate POSITION it had in the master; place it in a similar relative position within the new frame (translated to the target aspect):",
                ...items.map((b) => {
                  const pos = b.position ? ` [position in master: ${b.position}]` : "";
                  return `  • "${b.text}"${pos}${lengthHint(b.text)}`;
                }),
                "Do NOT skip any item from this list. Do NOT add headlines, numbers, taglines or badges that are not listed.",
              );
            }
          }
          const visualFactsBlock =
            visualFactsLines.length > 0
              ? [
                  "",
                  "===== MASTER VISUAL FACTS (PRIORITY 0.5 — extracted directly from the master image) =====",
                  "These were read off the master by a vision model. They are authoritative — render them verbatim. They override any conflict with the original brief.",
                  "",
                  ...visualFactsLines,
                ].join("\n")
              : "";

          finalPrompt = [
            `TASK: produce an advertising banner in aspect ratio ${targetRatio} (${orientation})${
              hasPixelTarget ? `, target pixel canvas ${targetW}×${targetH}` : ""
            }. The final image will be center-cropped/scaled to this exact canvas. Compose with that fact in mind.`,
            "",
            // Frames the task as a pure re-composition of an already-approved
            // asset. No clothing/style adjectives here — those caused the model
            // to override the master's outfit with "modest" alternatives.
            // Character fidelity is enforced by the ABSOLUTE FIDELITY block below.
            "===== CONTENT POLICY CONTEXT (READ FIRST) =====",
            "This task is a TECHNICAL RE-COMPOSITION of an ALREADY-APPROVED commercial advertising banner asset. The source image is the final approved creative — every visual element in it (person, clothing, objects, scene) has already passed content review. Your ONLY job is to re-frame this approved asset into a new aspect ratio. Do NOT reinterpret, restyle, or apply any creative judgment. Do NOT change character appearance in any way. Treat the entire source image as a locked brand asset.",
            "",
            // Cross-aspect resize: model usually copies master's
            // composition wholesale, which leaves edge texts dangling
            // outside the new aspect's safe area. Tell it explicitly to
            // re-stack edge content for the new frame.
            ...(orientation === "portrait (vertical)"
              ? [
                  "===== RE-STACK FOR PORTRAIT (PRIORITY 0 — overrides master's side composition) =====",
                  "The master was probably wider than this target. Any text the master had in the LEFT or RIGHT side columns MUST be relocated into the central vertical column for this 9:16/4:5/3:4 frame. Do NOT keep the master's side-column layout — there is NO ROOM in a portrait frame for side columns. Stack ALL text top-to-bottom inside the central 80% width column.",
                  "",
                ]
              : orientation === "landscape (horizontal)"
                ? [
                    "===== RE-STACK FOR LANDSCAPE (PRIORITY 0 — overrides master's edge composition) =====",
                    "MANDATORY TWO-COLUMN SIDE-STACK LAYOUT for this 16:9 / 3:2 / 4:3 / 5:4 frame:",
                    "  • LEFT COLUMN (x: 5% to 28% of width, y: 18% to 82% of height) — primary text stack: place headline, supporting text, and 1-2 key data points here, stacked top-to-bottom.",
                    "  • RIGHT COLUMN (x: 72% to 95% of width, y: 18% to 82% of height) — secondary text stack: place remaining text/numbers/badges + the CTA button here, stacked top-to-bottom.",
                    "  • CENTRAL 40% (x: 30% to 70%) — RESERVED for the key visual (person, main object, product). NO text here.",
                    "  • TOP 18% (y: 0 to 18%) — STRICTLY background only. ZERO text, ZERO numbers, ZERO logo, ZERO CTA. It WILL be cropped.",
                    "  • BOTTOM 18% (y: 82% to 100%) — STRICTLY background only. ZERO text, ZERO CTA button, ZERO badges. It WILL be cropped.",
                    "CRITICAL: the CTA button MUST be placed inside the RIGHT COLUMN (vertically centered or below the right-column text), NEVER at the bottom of the frame. If the master had a bottom-row CTA, MOVE IT into the right column for this landscape frame.",
                    "Do NOT keep the master's horizontal-band composition (headline-on-top / CTA-on-bottom). For landscape you MUST use a side-column stack — the top and bottom of a 16:9 frame are unusable for content.",
                    "",
                  ]
                : []),
            "===== ABSOLUTE FIDELITY TO MASTER (PRIORITY 0 — NEVER VIOLATE) =====",
            "The FIRST attached image is the MASTER. It already shows the CORRECT central object, the CORRECT person, and the CORRECT scene for this campaign. Your job is ONLY to re-frame this exact scene into a new aspect ratio — NOT to reimagine it.",
            "",
            "CHARACTER FIDELITY — ZERO TOLERANCE FOR DEVIATION:",
            "- Reproduce the person's face, hair, skin tone, clothing, accessories EXACTLY as shown in the master. Every detail is locked.",
            "- Do NOT change the clothing style, color, cut, coverage, or fabric — not even slightly. If the master shows a specific outfit, that outfit appears unchanged in the result.",
            "- Do NOT apply any styling corrections, modesty adjustments, or creative enhancements to the character.",
            "- The character's appearance is a FIXED BRAND ASSET — treat it identically to a logo or wordmark.",
            "",
            "OBJECT FIDELITY — WHAT THE PERSON HOLDS OR SHOWS IN THE MASTER IS THE SUBJECT OF THE BANNER. Reproduce it as the EXACT SAME OBJECT — same type, same shape, same artwork printed on it, same colors, same text/wordmark. EXAMPLES OF WHAT IS STRICTLY FORBIDDEN:",
            "- If the master shows a CARD / TICKET / INVITATION, your result MUST show a card. Do NOT replace it with a trophy, cup, chip, coin, phone, bottle or any other object.",
            "- If the master shows a TROPHY / CUP, your result MUST show a trophy. Do NOT replace it with a card or anything else.",
            "- If the master shows a POKER CHIP, your result MUST show that exact chip. Do NOT swap to a card or trophy.",
            "- If the master shows a BOTTLE / PRODUCT / PHONE, keep it as that exact product.",
            'Do NOT interpret the brief\'s words ("tournament", "promo", "event") to invent new symbolic objects. The MASTER IMAGE is the only valid source of truth for what the central object is.',
            "",
            "Same person, same face, same hair, same clothing, same pose direction as the master. Same setting / background type as the master.",
            visualFactsBlock,
            "",
            // Anti-hallucination wall. Models love to "improve" a banner
            // by adding decorative icons, sub-badges, extra captions or
            // a friendlier CTA — especially when re-stacking to a
            // landscape frame with empty side columns to fill. We
            // enumerate exactly what may appear and forbid everything
            // else.
            "===== STRICT CONTENT INVENTORY (PRIORITY 0 — DO NOT INVENT) =====",
            "The final image MUST contain ONLY the elements listed in the MASTER VISUAL FACTS block above, plus the brand logo / wordmark, plus pure atmospheric background. Nothing else.",
            "",
            "STRICTLY FORBIDDEN — do NOT add ANY of the following, even if they would 'make the banner look more complete':",
            "- New CTA buttons or call-to-action labels that are not present in the master. If the master had no CTA, the result has no CTA. If the master had a numeric/code-style CTA pill (e.g. '1234567890'), keep that exact same pill — do NOT replace it with words like 'Join now', 'Учаснік', 'Долучитися', 'Bet now', etc.",
            "- New badges, ribbons, seals, stamps, frames, ornamental borders or sashes.",
            "- New icons of any kind: NO crowns, NO trophies, NO laurel wreaths, NO calendars, NO clocks, NO suns, NO moons, NO stars, NO checkmarks, NO arrows, NO sparkles, NO crystal balls, NO scrolls, NO maps, NO flame icons, NO money/coin icons, NO crystal icons, NO mystical symbols.",
            "- New decorative text labels next to existing texts (no '5 days of magic' → '✨ 5 days ✨', no extra subheadings, no extra taglines, no rating stars, no '100%' badges if not in the master).",
            "- New secondary characters, new mascots, new pets, new bystanders.",
            "- New props in the scene (no extra trophies in the background, no floating chess pieces, no candle, no incense, no books, etc.).",
            "- New typographic flourishes (no underlines, no bullet rules, no decorative dividers between text blocks).",
            "- New gradient overlays, lens-flare doublings, rainbow ribbons or aurora streaks that were not in the master.",
            "",
            "THE BANNER IS NOT INCOMPLETE — empty space is intentional. If a side column has no text from the inventory, fill it with the SAME atmospheric background as the rest of the scene (sand, sky, gradient) — NEVER fill it with newly invented icons or auxiliary content.",
            "",
            // Pixel-explicit safe margins for THIS specific target.
            // The model gets actual numbers, not just percentages — works
            // better with gpt-image's text reasoning.
            ...(hasPixelTarget
              ? [
                  "===== CROP-SAFE COMPOSITION RULES (PRIORITY 1) =====",
                  `- TARGET PIXEL CANVAS: ${targetW}×${targetH}.`,
                  `- HARD SAFE MARGINS for this target: ≥ ${Math.max(16, Math.round(targetW * 0.08))} pixels from the LEFT edge, ≥ ${Math.max(16, Math.round(targetW * 0.08))} pixels from the RIGHT edge, ≥ ${Math.max(16, Math.round(targetH * 0.08))} pixels from the TOP edge, ≥ ${Math.max(16, Math.round(targetH * 0.1))} pixels from the BOTTOM edge.`,
                  `- ALL critical elements (headline, supporting text, CTA, numbers, brand logo, main subject's face) MUST sit inside the rectangle (${Math.max(16, Math.round(targetW * 0.08))}, ${Math.max(16, Math.round(targetH * 0.08))}) → (${targetW - Math.max(16, Math.round(targetW * 0.08))}, ${targetH - Math.max(16, Math.round(targetH * 0.1))}).`,
                  "- OUTSIDE this rectangle (the outer 8-10% ring) only atmospheric background is allowed.",
                  Math.min(targetW, targetH) < 400
                    ? `- TINY-TARGET RULE: this target is very small (smallest side = ${Math.min(targetW, targetH)} px). Text becomes unreadable at this scale. Prefer a BRAND-MARK-ONLY composition (logo + central object + minimal decoration). If text must appear, use AT MOST 1-2 short words and make them disproportionately large relative to the canvas. NEVER place long headlines or multi-line supporting copy on a tile smaller than 400 px on its smallest side.`
                    : "- Use SMALLER, MORE COMPACT TEXT than the master. Text should be readable at the target size but never reach close to any edge.",
                  "- Generous internal whitespace — better an empty corner than truncated text.",
                ]
              : [
                  "===== CROP-SAFE COMPOSITION RULES (PRIORITY 1) =====",
                  "- Treat the OUTER 8% of each edge as a CROP-RISK ZONE — do NOT put any text, faces, hands, logo or unique content inside that border. Use it only for atmospheric background.",
                  "- Place ALL critical elements (headline, supporting text, CTA, numbers/percentages, brand logo, main subject's face) inside the CENTRAL SAFE AREA — the middle ~80% of width and ~80% of height.",
                  "- Use SMALLER, MORE COMPACT TEXT than the master. Text should be readable at the target size but never reach close to any edge.",
                  "- Generous internal whitespace — better an empty corner than truncated text.",
                ]),
            "",
            "===== ASPECT-RATIO RULES (PRIORITY 2) =====",
            `- Aspect ratio ${targetRatio} is BINDING. Plan every element for this frame from scratch.`,
            `- COMPOSITION FOR ${orientation}: ${layoutHint}`,
            "- DO NOT copy element positions from the master — they belong to a different aspect.",
            "- DO NOT just stretch, letterbox or zoom into the master.",
            "- Reframing the LAYOUT is allowed and required. Reframing the SUBJECT is forbidden (see Priority 0).",
            "",
            "===== WHAT THE MASTER REFERENCE IS FOR =====",
            "Take from the master — and ONLY these things:",
            "- The exact central object (held / featured) — see Priority 0",
            "- The exact person (face, hair, clothing) and their pose",
            "- The exact brand logo / wordmark (pixel-faithful)",
            "- The exact color palette, lighting, mood, time of day",
            "- ONLY the readable text content that already exists in the master / MASTER VISUAL FACTS list — verbatim, character-for-character. Do NOT add any text that is not in that list.",
            "- Typographic family and weight",
            "Replan only: element POSITIONS and SIZES for the new aspect.",
            "Do NOT take from the original brief: extra icons, extra CTAs, extra decoration, sub-badges, or any additional persons/objects/props. The brief is for context only.",
            "",
            "===== HARD DON'TS (FINAL REMINDER) =====",
            "- Do NOT substitute the central object with a different one (cards stay cards, trophies stay trophies, chips stay chips).",
            "- Do NOT add or remove people, props or marketing copy. Zero new persons, zero new props.",
            "- Do NOT translate or rewrite any text — keep words and numbers exactly as in the master and the MASTER VISUAL FACTS list above.",
            "- Do NOT place text where center-cropping to the target canvas could cut it off.",
            "- Do NOT invent symbolic objects that the brief implies but the master does not show.",
            "- Do NOT add ANY decorative icons (crowns, trophies, calendars, suns, moons, stars, sparkles, checkmarks, arrows, mystical symbols, etc.). See STRICT CONTENT INVENTORY above.",
            "- Do NOT add a new CTA button or replace the master's CTA pill with a word/phrase. The CTA from the master is the only allowed CTA, kept verbatim.",
            "- Do NOT add new badges, ribbons, frames or decorative dividers.",
            "- Do NOT add helper labels next to existing texts (no extra '✨', no '5 days' → '5 amazing days', no '100%' → '100% unforgettable badge').",
            "- If a side column or corner has no inventory item assigned to it, leave it as the atmospheric background. Empty space is intentional — never fill it with invented decoration.",
            "",
            "===== ORIGINAL CREATIVE BRIEF (CONTEXT ONLY) =====",
            "The brief below describes the campaign idea. Use it ONLY for: text content, brand name, language, and supporting details. NEVER use it to override the central object or person shown in the master image — the master always wins for visual subject.",
            "",
            finalPrompt,
          ].join("\n");
        }

        // STRICT global language enforcement — image models often ignore language
        // hints buried inside long prompts, so we prepend AND append a hard rule.
        const langLabelStrict = LANG_LABELS[language];
        if (langLabelStrict) {
          const head = `STRICT LANGUAGE RULE: Every single piece of rendered, readable text inside the image — headline, subheadline, body copy, CTA button, badges, callouts, numbers with captions, stickers, watermarks — MUST be written in ${langLabelStrict}. Do NOT use English or any other language for any in-image text unless the brand name itself is in that language. This rule overrides any other language inference from the brand, subject, or template.\n\n`;
          const tail = `\n\nREMINDER: ALL in-image text MUST be in ${langLabelStrict}. No exceptions.`;
          finalPrompt = head + finalPrompt + tail;
        }

        // Headroom raised — crop-aware wrap is verbose and goes BEFORE
        // the brief. Truncation here just drops the tail of the original
        // brief, which is the least critical part when a master image is
        // attached (the master carries visual context).
        if (finalPrompt.length > 6000) finalPrompt = finalPrompt.slice(0, 6000);

        const dataUrlToBlob = (dataUrl: string): { blob: Blob; ext: string } | null => {
          const m = dataUrl.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
          if (!m) return null;
          const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
          if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) return null;
          const cleanedBase64 = m[2].replace(/\s/g, "");
          const bin = Uint8Array.from(atob(cleanedBase64), (c) => c.charCodeAt(0));
          const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png";
          return { blob: new Blob([bin], { type: mime }), ext };
        };

        try {
          let res: Response;
          const refs: {
            blob: Blob;
            ext: string;
            dataUrl: string;
            role:
              | "brand_logo"
              | "slot_screenshot"
              | "slot_logo"
              | "side_a_logo"
              | "side_b_logo"
              | "source_image";
          }[] = [];
          // source_image must come FIRST in the refs list so providers that
          // pay extra attention to the first attachment (OpenAI edits, Gemini
          // multi-image) treat it as the primary master.
          if (hasSourceImage && body.source_image) {
            const r = dataUrlToBlob(body.source_image);
            if (r) refs.push({ ...r, dataUrl: body.source_image, role: "source_image" });
          }
          if (hasSlotScreenshot && body.slot_screenshot) {
            const r = dataUrlToBlob(body.slot_screenshot);
            if (r) refs.push({ ...r, dataUrl: body.slot_screenshot, role: "slot_screenshot" });
          }
          if (hasSlotLogo && body.slot_logo) {
            const r = dataUrlToBlob(body.slot_logo);
            if (r) refs.push({ ...r, dataUrl: body.slot_logo, role: "slot_logo" });
          }
          if (hasSideALogo && body.side_a_logo) {
            const r = dataUrlToBlob(body.side_a_logo);
            if (r) refs.push({ ...r, dataUrl: body.side_a_logo, role: "side_a_logo" });
          }
          if (hasSideBLogo && body.side_b_logo) {
            const r = dataUrlToBlob(body.side_b_logo);
            if (r) refs.push({ ...r, dataUrl: body.side_b_logo, role: "side_b_logo" });
          }
          if (hasLogo && body.brand_logo) {
            const r = dataUrlToBlob(body.brand_logo);
            if (r) refs.push({ ...r, dataUrl: body.brand_logo, role: "brand_logo" });
          }

          const refLines: string[] = [];
          refs.forEach((r) => {
            if (r.role === "source_image") {
              refLines.push(
                `The FIRST attached image is the MASTER REFERENCE banner. CRITICAL: whatever central object the person holds or shows in the master (a card, a trophy, a chip, a product, etc.) MUST be reproduced as that EXACT same object — same type, same shape, same artwork on it. Do not swap a card for a trophy or vice versa. The master is the only source of truth for the visual subject. Use the master ALSO as the source of: brand identity, color palette, lighting, person's face/hair/clothing, text CONTENT (verbatim). Treat its ELEMENT POSITIONS as obsolete — they were planned for a different aspect ratio. Re-plan layout positions ONLY for ${body.aspect_ratio || "1:1"}, but never re-plan WHAT objects appear.`,
              );
            } else if (r.role === "slot_screenshot") {
              refLines.push(
                `One attached reference image is a SCREENSHOT of the slot${slotName ? ` "${slotName}"` : ""}. Use it as the KEY VISUAL — faithfully reproduce its art, characters, symbols, color palette and overall mood in a premium dimensional way. Do not change the slot identity.`,
              );
            } else if (r.role === "slot_logo") {
              refLines.push(
                `One attached reference image is the SLOT LOGO${slotName ? ` of "${slotName}"` : ""}. Reproduce it exactly (preserve shape, proportions, colors, wordmark) as the primary logo placed according to the layout rules. Do not redesign.`,
              );
            } else if (r.role === "side_a_logo") {
              refLines.push(
                `One attached reference image is the LEFT-side crest/flag${sideAName ? ` of "${sideAName}"` : ""}. Reproduce it exactly (preserve shape, proportions, colors) and place it on the LEFT side of the composition as the team/national emblem.`,
              );
            } else if (r.role === "side_b_logo") {
              refLines.push(
                `One attached reference image is the RIGHT-side crest/flag${sideBName ? ` of "${sideBName}"` : ""}. Reproduce it exactly (preserve shape, proportions, colors) and place it on the RIGHT side of the composition as the team/national emblem.`,
              );
            } else {
              refLines.push(
                `One attached reference image is the BRAND LOGO${brandName ? ` of "${brandName}"` : ""}. Reproduce it exactly (preserve shape, proportions, colors, wordmark) as a small clean brand mark in a corner. Do not redesign.`,
              );
            }
          });
          const promptWithRefs =
            refs.length > 0
              ? `${finalPrompt}\n\nREFERENCE IMAGES:\n- ${refLines.join("\n- ")}`
              : finalPrompt;

          const modelStr = (body.model || "").toLowerCase();
          const isNano = modelStr.includes("gemini") || modelStr.startsWith("google/");
          const requestedAspect = body.aspect_ratio || "1:1";

          if (isNano) {
            // === nano-banana / Gemini path → OpenRouter chat completions ===
            const orKey = process.env.OPENROUTER_API_KEY;
            if (!orKey) {
              return Response.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
            }
            const promptForChat = [
              promptWithRefs,
              `\nFINAL OUTPUT — aspect ratio: ${requestedAspect}; quality preset: ${quality}.`,
            ].join("");
            const userContent: Array<Record<string, unknown>> = [
              { type: "text", text: promptForChat.slice(0, 6000) },
            ];
            refs.forEach((r) => {
              userContent.push({ type: "image_url", image_url: { url: r.dataUrl } });
            });
            const orModel = (body.model || "").trim() || "google/gemini-3.1-flash-image-preview";

            res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${orKey}`,
                "HTTP-Referer": "https://dream-weaver-studio.local",
                "X-Title": "Dream Weaver Studio",
              },
              body: JSON.stringify({
                model: orModel,
                messages: [{ role: "user", content: userContent }],
                modalities: ["image", "text"],
                image_config: { aspect_ratio: requestedAspect },
                aspect_ratio: requestedAspect,
                providerOptions: {
                  google: { imageConfig: { aspectRatio: requestedAspect } },
                },
              }),
            });
          } else {
            // === gpt-image path → OpenAI direct ===
            // OpenAI hosts the image model as "gpt-image-1" (no "gpt-image-2"
            // exists). We always send that name regardless of what the
            // frontend's MODEL_IDS happens to say.
            // For resize buckets we honour target_w/target_h so the model
            // emits an image at-or-above the largest tile size in the
            // bucket — all subsequent client-side scales are then pure
            // downscales (no fidelity loss).
            const size = openAiSizeFor(
              requestedAspect,
              Number(body.target_w) || undefined,
              Number(body.target_h) || undefined,
            );
            const promptForOpenAI = promptWithRefs.slice(0, 4000);

            if (refs.length > 0) {
              // Image-to-image / multi-reference → /v1/images/edits with
              // multipart form. OpenAI accepts up to 4 refs via image[].
              const form = new FormData();
              form.append("model", "gpt-image-2");
              form.append("prompt", promptForOpenAI);
              form.append("size", size);
              form.append("quality", quality);
              form.append("output_format", "jpeg");
              form.append("output_compression", "88");
              form.append("n", "1");
              refs.forEach((r, i) => {
                form.append(
                  refs.length > 1 ? "image[]" : "image",
                  r.blob,
                  `${r.role}-${i}.${r.ext}`,
                );
              });
              res = await fetch("https://api.openai.com/v1/images/edits", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form,
              });
            } else {
              // Text-to-image → /v1/images/generations.
              res = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model: "gpt-image-2",
                  prompt: promptForOpenAI,
                  size,
                  quality,
                  n: 1,
                }),
              });
            }
          }

          const text = await res.text();
          if (!res.ok) {
            console.error("Image provider error", res.status, text);
            // Detect common OpenAI billing / quota errors so the admin
            // can see them in system_logs rather than hunting server stdout.
            const isQuota =
              res.status === 429 &&
              (text.includes("insufficient_quota") || text.includes("exceeded your current quota"));
            void logSystem({
              supa,
              level: "error",
              category: "image-gen",
              message: isQuota ? "openai quota exceeded (no funds on API key)" : "image provider error",
              user_id: authedUser.id,
              request_id: requestId,
              duration_ms: Date.now() - requestStartedAt,
              context: {
                provider_status: res.status,
                is_quota_error: isQuota,
                model: body.model || "gpt-image-2",
                preset_id: (body.preset_id as string) || null,
                detail: text.slice(0, 300),
              },
            });
            return Response.json(
              { error: `Provider ${res.status}`, detail: text.slice(0, 500) },
              { status: 502 },
            );
          }

          // Two response shapes — OpenAI's /v1/images/* returns
          // { data: [{b64_json|url}] } while OpenRouter chat-completions
          // returns { choices: [{message: {images, content}}] }. Branch
          // on which path we just took.
          let image: string | undefined;
          let usage: Record<string, unknown> | null = null;
          if (!isNano) {
            // ---- OpenAI direct response ----
            try {
              const data = JSON.parse(text) as {
                data?: Array<{ b64_json?: string; url?: string }>;
                usage?: {
                  input_tokens?: number;
                  output_tokens?: number;
                  total_tokens?: number;
                  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
                };
              };
              const item = data.data?.[0];
              image = item?.b64_json ? `data:image/jpeg;base64,${item.b64_json}` : item?.url;
              const u = data.usage;
              usage = {
                provider: "openai",
                model: "gpt-image-2",
                quality,
                input_text_tokens: u?.input_tokens_details?.text_tokens ?? 0,
                input_image_tokens: u?.input_tokens_details?.image_tokens ?? 0,
                output_image_tokens: u?.output_tokens ?? 0,
                input_tokens: u?.input_tokens ?? null,
                total_tokens: u?.total_tokens ?? null,
                cost_usd: null,
              };
            } catch (e) {
              console.error("OpenAI response parse failed", e);
            }
          } else {
            // ---- OpenRouter chat-completions response (nano-banana) ----
            const data = JSON.parse(text) as {
              choices?: Array<{
                message?: {
                  images?: Array<{ image_url?: { url?: string } | string }>;
                  content?: unknown;
                  image_url?: { url?: string } | string;
                };
              }>;
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                total_tokens?: number;
              };
            };
            const msg = data.choices?.[0]?.message;

            // 1. canonical OpenRouter: message.images[0].image_url.url
            const firstImage = msg?.images?.[0];
            if (firstImage) {
              if (typeof firstImage === "object" && firstImage !== null) {
                const iu = (firstImage as { image_url?: unknown }).image_url;
                if (typeof iu === "string") image = iu;
                else if (iu && typeof iu === "object" && "url" in iu) {
                  image = (iu as { url?: string }).url;
                }
              } else if (typeof firstImage === "string") {
                image = firstImage;
              }
            }

            // 2. some providers stash image_url directly on the message
            if (!image && msg?.image_url) {
              const iu = msg.image_url;
              image = typeof iu === "string" ? iu : iu?.url;
            }

            // 3. content array — OpenAI chat-style multimodal output
            if (!image && Array.isArray(msg?.content)) {
              for (const block of msg.content as Array<Record<string, unknown>>) {
                if (!block) continue;
                if (block.type === "image_url" || block.type === "image") {
                  const iu = block.image_url;
                  if (typeof iu === "string") {
                    image = iu;
                    break;
                  }
                  if (iu && typeof iu === "object" && "url" in (iu as object)) {
                    image = (iu as { url?: string }).url;
                    break;
                  }
                }
                if (typeof block.image === "string") {
                  image = block.image;
                  break;
                }
              }
            }

            // 4. content as plain string with embedded dataURL
            if (!image && typeof msg?.content === "string") {
              const m = msg.content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
              if (m) image = m[0];
            }

            // If we still couldn't find it — log the structure so we can
            // actually debug. Dump message keys + a slice of content.
            if (!image && msg) {
              console.error("Parser miss — message keys:", Object.keys(msg));
              try {
                console.error("message preview:", JSON.stringify(msg).slice(0, 800));
              } catch {
                /* circular or oversized — skip */
              }
            }

            usage = {
              provider: "openrouter",
              model: (body.model || "").trim() || "google/gemini-3.1-flash-image-preview",
              quality,
              prompt_tokens: data.usage?.prompt_tokens ?? null,
              completion_tokens: data.usage?.completion_tokens ?? null,
              total_tokens: data.usage?.total_tokens ?? null,
              cost_usd: null,
            };
          }
          if (!image) {
            // Detect safety blocks. Three flavours:
            //   1. Explicit OpenAI content_filter finish_reason
            //   2. Explicit Google PROHIBITED_CONTENT native_finish_reason
            //   3. SILENT block: model returns a text-only assistant
            //      message with no images, no refusal field, no flag —
            //      typical of Gemini's softer safety layer that just
            //      "describes" the requested image instead of making it.
            let blockReason: string | null = null;
            try {
              const parsed = JSON.parse(text) as {
                choices?: Array<{
                  finish_reason?: string;
                  native_finish_reason?: string;
                  message?: {
                    refusal?: string | null;
                    content?: unknown;
                    images?: unknown;
                  };
                }>;
              };
              const ch = parsed.choices?.[0];
              const fr = ch?.finish_reason || "";
              const nfr = ch?.native_finish_reason || "";
              const refusal = ch?.message?.refusal;
              const msgContent = ch?.message?.content;
              const hasNoImagesArray =
                !ch?.message?.images ||
                (Array.isArray(ch.message.images) && ch.message.images.length === 0);
              const contentIsString =
                typeof msgContent === "string" && msgContent.trim().length > 0;

              if (fr === "content_filter" || nfr === "PROHIBITED_CONTENT" || refusal) {
                blockReason =
                  (typeof refusal === "string" && refusal) ||
                  `Провайдер заблокировал генерацию по политике безопасности (${nfr || fr}). Попробуйте другую модель или измените описание (например уберите упоминания защищённых персонажей или брендов).`;
              } else if (hasNoImagesArray && contentIsString) {
                // Silent safety filter. The model just talks instead of
                // generating. Translate that into a clear user message.
                const sample = String(msgContent).trim().slice(0, 200);
                blockReason =
                  "Провайдер вернул только текст вместо картинки — обычно это срабатывание тихого фильтра безопасности (Google Gemini делает так с защищёнными персонажами, брендами и азартной тематикой). " +
                  `Попробуйте переключиться на другую модель или переформулировать описание. Ответ модели: «${sample}…»`;
              } else if (hasNoImagesArray && (msgContent === null || msgContent === undefined)) {
                // EMPTY response: model said "stop"/"completed" but
                // returned neither images nor text. Common when the model
                // is overloaded or hits an internal limit. Retry usually
                // fixes it — and the user message says so.
                blockReason =
                  "Модель вернула пустой ответ (без картинки и без текста). Обычно это сбой на стороне провайдера. Попробуйте ещё раз через несколько секунд или уменьшите Quality.";
              }

              // Always log finish_reason — it's the most useful hint.
              console.error("No image payload", {
                finish_reason: fr,
                native_finish_reason: nfr,
                has_refusal: !!refusal,
                preview: text.slice(0, 400),
              });
            } catch {
              /* not JSON or unexpected shape — fall through */
              console.error("No image payload (unparseable)", text.slice(0, 500));
            }

            return Response.json(
              {
                error: blockReason ? "content_filter" : "No image payload",
                detail: blockReason || text.slice(0, 500),
              },
              { status: blockReason ? 422 : 502 },
            );
          }

          // ---- Billing: total_tokens * coefficient(model, quality) ----
          // Anything we can't compute defaults to a tiny non-zero charge so
          // every successful generation still produces an audit trail.
          const modelKey = pricingModelKey(body.model);
          const totalTokens = (() => {
            const u = usage as Record<string, unknown> | null;
            if (!u) return 0;
            const direct = Number(u.total_tokens);
            if (Number.isFinite(direct) && direct > 0) return direct;
            // gpt-image-2 path: sum the components if total wasn't provided.
            const inText = Number(u.input_text_tokens) || 0;
            const inImg = Number(u.input_image_tokens) || 0;
            const outImg = Number(u.output_image_tokens) || 0;
            return inText + inImg + outImg;
          })();

          let coefficient = DEFAULT_COEFFICIENT;
          try {
            const { data: priceRow } = await supa
              .from("pricing_coefficients")
              .select("coefficient")
              .eq("model", modelKey)
              .eq("quality", quality)
              .maybeSingle();
            if (priceRow && Number.isFinite(Number(priceRow.coefficient))) {
              coefficient = Number(priceRow.coefficient);
            }
          } catch (e) {
            console.error("pricing lookup failed, falling back to default", e);
          }

          // Always charge at least a token-sized minimum so the system
          // can't be abused via zero-token responses.
          const rawCharge = Math.max(totalTokens, 1) * coefficient;
          const creditsCharged = Number(rawCharge.toFixed(4));
          const usageObj = (usage as Record<string, unknown>) || {};
          const costUsd = Number(usageObj.cost_usd ?? 0) || 0;

          // Spend atomically. If the user somehow went to zero between the
          // pre-flight check and now (race), we surface a payment-required
          // error but still return the image since the provider already ran.
          let newBalance: number | null = null;
          let billingError: string | null = null;
          try {
            const { data: spendResult, error: spendErr } = await supa.rpc("spend_credits", {
              p_user: authedUser.id,
              p_amount: creditsCharged,
              p_meta: {
                model: modelKey,
                quality,
                total_tokens: totalTokens,
                cost_usd: costUsd,
                coefficient,
              },
            });
            if (spendErr) {
              billingError = spendErr.message;
              void logSystem({
                supa,
                level: "error",
                category: "billing",
                message: "spend_credits rpc failed",
                user_id: authedUser.id,
                request_id: requestId,
                context: {
                  model: modelKey,
                  quality,
                  charge: creditsCharged,
                  total_tokens: totalTokens,
                },
                error: spendErr,
              });
            } else {
              newBalance = Number(spendResult);
            }
          } catch (e) {
            void logSystem({
              supa,
              level: "error",
              category: "billing",
              message: "spend_credits unexpected",
              user_id: authedUser.id,
              request_id: requestId,
              error: e,
            });
            billingError = e instanceof Error ? e.message : String(e);
          }

          // History + FTP integration. Master flow (no source_image,
          // no incoming card_id) creates a new generation_cards row.
          // Resize flow attaches to an existing card via body.card_id.
          // The FTP upload kicks off in the background and never blocks
          // the response — the user gets their image immediately.
          const isMaster = !hasSourceImage && !body.card_id;
          // Bucket resize calls suppress card attachment; the runner
          // will write the cropped tiles separately so history shows
          // exactly what the user got.
          const bodyForHistory = body.skip_history_attach
            ? ({ ...body, card_id: undefined } as unknown as Record<string, unknown>)
            : (body as unknown as Record<string, unknown>);
          const historyResult = await recordGenerationAndUpload({
            supa,
            userId: authedUser.id,
            body: bodyForHistory,
            image,
            isMaster: isMaster && !body.skip_history_attach,
            usage: usageObj,
            totalTokens,
            costUsd,
            costCredits: creditsCharged,
            coefficient,
            modelKey,
            quality,
            billingError,
            finalPrompt,
          });

          void logSystem({
            supa,
            level: "info",
            category: "image-gen",
            message: isMaster ? "master generated" : "resize generated",
            user_id: authedUser.id,
            request_id: requestId,
            duration_ms: Date.now() - requestStartedAt,
            context: {
              model: modelKey,
              quality,
              total_tokens: totalTokens,
              input_text_tokens:
                (usage as Record<string, unknown> | null)?.input_text_tokens ?? null,
              input_image_tokens:
                (usage as Record<string, unknown> | null)?.input_image_tokens ?? null,
              output_image_tokens:
                (usage as Record<string, unknown> | null)?.output_image_tokens ?? null,
              charge: creditsCharged,
              new_balance: newBalance,
              card_id: historyResult.cardId,
              generation_id: historyResult.generationId,
              preset_id: presetId || null,
              aspect_ratio: body.aspect_ratio || null,
              group_id: (body.group_id as string) || null,
              billing_error: billingError,
            },
          });

          // SEC-H2: if the charge failed (balance couldn't cover the actual
          // cost), do NOT hand back the image — that's the "near-zero balance
          // → free generation" exploit. The provider call is already spent,
          // but the user gets 402 instead of the unpaid image. The gen row
          // (with billing_error) stays for the audit trail.
          if (billingError) {
            return Response.json(
              {
                error: "insufficient_credits",
                detail: billingError,
                credits: {
                  charged: creditsCharged,
                  coefficient,
                  total_tokens: totalTokens,
                  new_balance: newBalance,
                  error: billingError,
                },
              },
              { status: 402 },
            );
          }

          return Response.json({
            image,
            prompt: finalPrompt,
            usage,
            credits: {
              charged: creditsCharged,
              coefficient,
              total_tokens: totalTokens,
              new_balance: newBalance,
              error: billingError,
            },
            card_id: historyResult.cardId,
            generation_id: historyResult.generationId,
          });
        } catch (e) {
          void logSystem({
            level: "error",
            category: "image-gen",
            message: "generate-image failed",
            user_id: authedUser.id,
            request_id: requestId,
            duration_ms: Date.now() - requestStartedAt,
            error: e,
          });
          // undici (Node fetch) throws `TypeError: terminated` with cause
          // `Error: read ECONNRESET` when an upstream connection drops
          // mid-stream. Maps cleanly to 504 (gateway timeout) so the
          // client retry/timeout messaging kicks in.
          const msg = e instanceof Error ? e.message : "Unknown error";
          const cause = (e as { cause?: { code?: string; message?: string } }).cause;
          const isNetworkDrop =
            msg.includes("terminated") ||
            msg.includes("ECONNRESET") ||
            msg.includes("socket hang up") ||
            cause?.code === "ECONNRESET" ||
            cause?.code === "UND_ERR_SOCKET";
          if (isNetworkDrop) {
            return Response.json(
              {
                error: "upstream_terminated",
                detail:
                  "Соединение с провайдером оборвалось. Это часто бывает на высокой Quality + большом разрешении. Попробуйте ещё раз — обычно помогает.",
              },
              { status: 504 },
            );
          }
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
