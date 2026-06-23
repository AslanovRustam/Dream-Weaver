// POST /api/extract-master
//
// Vision-LLM pre-pass for the resize batch flow. Takes the approved
// master banner, asks a multimodal LLM (gpt-4o-mini via OpenRouter) to
// read every piece of text on the page and describe the central object,
// person, scene, colours and style. The structured result is then
// fed into every subsequent i2i resize call so the image model knows
// exactly which words to render and which object to keep.
//
// This solves the classic i2i drift where text on a held card gets
// re-invented or a card becomes a trophy when reframed for a new
// aspect ratio.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { logSystem, newRequestId } from "@/lib/logger";
import { assertAllowedImageUrl } from "@/lib/safe-fetch";
import { rateLimitResponse } from "@/lib/request-guard";

type Body = {
  source_image?: string;
};

const SYSTEM = [
  "You are an expert visual auditor for a banner-resize pipeline.",
  "You will receive ONE banner image. Your job is to extract EVERY",
  "visual fact that another image generator would need to reproduce",
  "this banner faithfully in a different aspect ratio.",
  "",
  "===== CRITICAL VOCABULARY RULE (READ BEFORE WRITING ANYTHING) =====",
  "Your JSON output is fed directly into a downstream image generator",
  "with a STRICT content-safety classifier. Any aesthetic, suggestive,",
  "fashion-magazine or beauty-industry vocabulary will get the whole",
  "pipeline blocked. Write like a technical product datasheet, NOT like",
  "a fashion editorial.",
  "",
  "FORBIDDEN WORDS — never use any of these or their synonyms:",
  "  attractive, beautiful, pretty, gorgeous, stunning, lovely,",
  "  stylish, glamorous, glamour, elegant, sophisticated, chic,",
  "  sultry, captivating, alluring, seductive, sexy, sensual, sensuous,",
  "  flirty, playful, mysterious, dreamy, intimate, romantic, enchanting,",
  "  confident, intense, piercing, smouldering, smouldering, soulful,",
  "  fitted, form-fitting, body-hugging, tight, revealing, plunging,",
  "  low-cut, daring, bold, fierce, slim, slender, curvy, curves, curvaceous,",
  "  figure, silhouette, posture, contoured, athletic-build, toned,",
  "  close-up, body shot, torso shot, beauty shot, lifestyle shot,",
  "  glistening, glowing skin, flawless skin, dewy, wet-look,",
  "  pose, posing, posed, leaning, arching, draped",
  "",
  "Use neutral product-datasheet phrasing. Examples:",
  '  ✓ "person: red-haired, red-and-black racing suit, holding trophy"',
  '  ✗ "person: confident young woman with captivating smile in fitted racing suit"',
  '  ✓ "style: cinematic studio lighting, sharp focus, lens flare"',
  '  ✗ "style: glamorous magazine-cover polish with dreamy soft focus"',
  "",
  "Return strict JSON. Never use markdown fences. The JSON must match:",
  "{",
  '  "central_object": string,        // what the person holds or what the banner is centred on. Be precise about the OBJECT TYPE (card, trophy, chip, bottle, phone, pendant, ...) and shape (vertical card, round chip, ornate cup, ...). Neutral terms only.',
  '  "central_object_texts": string[],// every readable piece of text printed on or around the central object, character-for-character, in reading order. Russian/English/etc. exactly as it appears.',
  '  "person": string | null,         // if a person is visible, describe with FACTUAL NEUTRAL vocabulary only. Include: hair colour, clothing colour + type, pose (directional only), expression (neutral only), what they hold. Allowed pose words: "facing camera", "three-quarter view", "side profile", "full body", "half body", "holding X", "both hands on X", "arm extended", "standing", "seated", "head tilted". Allowed expression words: "smiling", "neutral expression", "serious", "mouth open", "eyes open", "eyes closed". DO NOT use aesthetic adjectives (attractive, beautiful, confident, captivating, sultry, etc.), clothing fit/cut adjectives (fitted, tight, revealing, plunging, etc.), age qualifiers (young, mid-thirties, etc.), or body description (curves, figure, slim, toned). Examples: ✓ "red hair, red-and-black racing suit, facing camera, smiling, both hands holding silver trophy" ✗ "attractive young woman with captivating smile in fitted racing suit, posed confidently". Null if no person.',
  '  "scene": string,                 // background and atmosphere — describe environment, lighting effects, weather, time of day, terrain, floating props. Allowed: "Mars desert at sunset", "neon-lit street", "starry sky with aurora", "studio gradient backdrop", "underwater scene", "racing track", "stadium crowd". Avoid only person-focused mood adjectives ("intimate setting", "romantic atmosphere"). Mood descriptors that refer to the SCENE (epic, magical, futuristic, cinematic, dramatic, vintage) are fine.',
  '  "colors": string[],              // 3–6 dominant colour names (e.g. "sky blue", "warm gold", "orange-red").',
  '  "style": string,                 // overall visual style — TECHNICAL terms only. Allowed: "cinematic lighting", "studio lighting", "editorial product shot", "sharp focus", "shallow depth of field", "lens flare", "gradient backdrop", "neon highlights", "3D render", "photographic", "illustrated", "isometric". Forbidden: "glamour", "magazine cover", "fashion editorial", "beauty shot", "intimate", "romantic", "dreamy".',
  '  "banner_texts": Array<{text: string, position: string}>',
  "  //   every readable piece of text on the banner OUTSIDE the central object — character-for-character, in reading order.",
  '  //   `position` is one of: "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right" | "button-bottom" | "button-top".',
  '  //   Use "button-bottom" / "button-top" specifically for CTA-style buttons.',
  "}",
  "",
  "Rules:",
  "- Reproduce all text EXACTLY as printed. Russian stays Russian, English stays English. Do not translate, do not correct typos.",
  '- For numeric strings (e.g. "1222211212"), be PRECISE — count digits carefully before writing them down. Do not add or drop digits.',
  "- If a value is unknown, use null for person and empty string for scene/style. Use empty arrays for texts.",
  "- Output ONLY the JSON, nothing else. No commentary. No markdown.",
  "- Before outputting, RE-READ your person/scene/style strings. If ANY",
  "  forbidden word from the list above appears, rewrite that string",
  "  with neutral product-datasheet vocabulary before returning.",
].join("\n");

export type BannerTextItem = { text: string; position: string };

export type MasterDetails = {
  central_object: string;
  central_object_texts: string[];
  person: string | null;
  scene: string;
  colors: string[];
  style: string;
  banner_texts: BannerTextItem[];
};

const EMPTY: MasterDetails = {
  central_object: "",
  central_object_texts: [],
  person: null,
  scene: "",
  colors: [],
  style: "",
  banner_texts: [],
};

/** Normalise legacy responses where banner_texts is a plain string[]. */
function normaliseBannerTexts(raw: unknown): BannerTextItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return { text: entry, position: "" };
      if (entry && typeof entry === "object") {
        const text =
          typeof (entry as { text?: unknown }).text === "string"
            ? (entry as { text: string }).text
            : "";
        const position =
          typeof (entry as { position?: unknown }).position === "string"
            ? (entry as { position: string }).position
            : "";
        return { text, position };
      }
      return { text: "", position: "" };
    })
    .filter((b) => b.text.trim().length > 0);
}

// Belt-and-suspenders scrub: even with the strict system prompt the
// model can slip a forbidden adjective into a person/scene/style field.
// We replace those words BEFORE the JSON gets baked into the resize
// prompt. Words removed entirely (not substituted), then collapsed
// whitespace — the surrounding factual nouns stay intact.
const FORBIDDEN_PATTERN =
  /\b(attractive|beautiful|pretty|gorgeous|stunning|lovely|stylish|glamorous|glamour|elegant|sophisticated|chic|sultry|captivating|alluring|seductive|sexy|sensual|sensuous|flirty|playful|mysterious|dreamy|intimate|romantic|enchanting|smouldering|smoldering|soulful|piercing|confident|intense|fitted|form-fitting|body-hugging|tight|revealing|plunging|low-cut|daring|fierce|slim|slender|curvy|curves|curvaceous|figure|silhouette|posture|contoured|toned|glistening|dewy|wet-look|close-up|beauty\sshot|lifestyle\sshot|posing|posed|leaning|arching|draped)\b/gi;

function sanitize(s: string): string {
  return s
    .replace(FORBIDDEN_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s,/g, ",")
    .trim();
}

function parseLLMJson(raw: string): MasterDetails {
  // Strip code fences if the model defied instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  // The model sometimes emits leading prose — find the first `{` and the
  // matching last `}` and parse the slice.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return EMPTY;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<
      Omit<MasterDetails, "banner_texts">
    > & { banner_texts?: unknown };
    return {
      central_object: sanitize(String(parsed.central_object ?? "")),
      central_object_texts: Array.isArray(parsed.central_object_texts)
        ? parsed.central_object_texts.filter((s): s is string => typeof s === "string")
        : [],
      person:
        typeof parsed.person === "string" && parsed.person.trim() ? sanitize(parsed.person) : null,
      scene: sanitize(String(parsed.scene ?? "")),
      colors: Array.isArray(parsed.colors)
        ? parsed.colors.filter((s): s is string => typeof s === "string")
        : [],
      style: sanitize(String(parsed.style ?? "")),
      banner_texts: normaliseBannerTexts(parsed.banner_texts),
    };
  } catch {
    return EMPTY;
  }
}

export async function POST(request: Request) {
        const requestId = newRequestId();
        const startedAt = Date.now();
        let user;
        try {
          user = await requireUser(request);
        } catch (err) {
          return authErrorResponse(err);
        }

        const emRl = rateLimitResponse("extract-master", user.id, 30, 60_000);
        if (emRl) return emRl;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
        }
        // Vision pre-pass uses OpenAI direct (gpt-4o-mini is an OpenAI model).

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        // Allow either a dataURL (fresh master from the browser) or an
        // FTP URL (master loaded from /history). The vision endpoint
        // happens to accept both transparently — OpenAI's `image_url`
        // field handles public URLs — so we just pass whatever we got
        // through, as long as it's a usable source.
        const src = body.source_image;
        if (!src) {
          return Response.json({ error: "source_image required" }, { status: 400 });
        }
        if (!src.startsWith("data:") && !src.startsWith("http://") && !src.startsWith("https://")) {
          return Response.json(
            { error: "source_image must be a dataURL or http(s) URL" },
            { status: 400 },
          );
        }
        // SSRF guard: a URL source must point at our own public image host
        // — otherwise a user could proxy arbitrary URLs through OpenAI's
        // server-side image fetch (image_url is fetched by OpenAI).
        if (!src.startsWith("data:")) {
          try {
            await assertAllowedImageUrl(src);
          } catch {
            return Response.json({ error: "source_image URL not allowed" }, { status: 400 });
          }
        }

        try {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              temperature: 0,
              messages: [
                { role: "system", content: SYSTEM },
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Extract the banner facts for the attached image." },
                    { type: "image_url", image_url: { url: src } },
                  ],
                },
              ],
            }),
          });
          const text = await res.text();
          if (!res.ok) {
            void logSystem({
              level: "error",
              category: "image-gen",
              message: "vision pre-pass provider error",
              user_id: user.id,
              request_id: requestId,
              duration_ms: Date.now() - startedAt,
              context: {
                model: "gpt-4o-mini",
                purpose: "vision_pre_pass",
                status: res.status,
                response_preview: text.slice(0, 300),
                source_kind: src.startsWith("data:") ? "dataURL" : "url",
              },
            });
            return Response.json(
              { error: "Vision provider error", detail: text.slice(0, 300) },
              { status: 502 },
            );
          }
          const data = JSON.parse(text) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
            };
          };
          const raw = data.choices?.[0]?.message?.content ?? "";
          const details = parseLLMJson(raw);
          void logSystem({
            level: "info",
            category: "image-gen",
            message: "vision pre-pass succeeded",
            user_id: user.id,
            request_id: requestId,
            duration_ms: Date.now() - startedAt,
            context: {
              model: "gpt-4o-mini",
              purpose: "vision_pre_pass",
              prompt_tokens: data.usage?.prompt_tokens ?? null,
              completion_tokens: data.usage?.completion_tokens ?? null,
              total_tokens: data.usage?.total_tokens ?? null,
              source_kind: src.startsWith("data:") ? "dataURL" : "url",
              extracted_texts_count:
                (details.banner_texts?.length ?? 0) + (details.central_object_texts?.length ?? 0),
            },
          });
          return Response.json({ details });
        } catch (e) {
          void logSystem({
            level: "error",
            category: "image-gen",
            message: "vision pre-pass unexpected failure",
            user_id: user.id,
            request_id: requestId,
            duration_ms: Date.now() - startedAt,
            context: { model: "gpt-4o-mini", purpose: "vision_pre_pass" },
            error: e,
          });
          return Response.json(
            { error: e instanceof Error ? e.message : "Unknown error" },
            { status: 500 },
          );
        }
      }
