// Generate an email hero banner from the email brief.
//
// 1) An "art director" agent (gpt-4o-mini, OpenAI-direct) turns the brief into
//    ONE image prompt — cinematic iGaming hero, and CRITICALLY: no
//    text/letters/words in the image (numbers allowed), so the email stays
//    easy to translate.
// 2) OpenAI's images API (gpt-image-2.5-flare) renders it. A logo/reference
//    banner can be passed as a style REFERENCE (never rendered as-is) via
//    the i2i /v1/images/edits path. "Overlay" mode is handled on the client.
//
// Also used (via presetTemplate/feature) by the wheel/slot/crash landing
// builders for their AI background + character generation — same engine,
// just a different prompt source.
//
// Body: { brand?, heroTitle?, body?, logoBase64?, logoMode?, model? }
// Response: { imageUrl (data URL), prompt, costUsd }
import { optionalUser } from "@/lib/auth-server";
import { recordUsage } from "@/lib/usage";
import { openAiSizeString } from "@/lib/imageSizes";

export const runtime = "nodejs";
// Landing/email hero images can also run on a slow model — allow up to 5 min.
export const maxDuration = 300;

// Same cheap/fast OpenAI-direct tier already used for resizes
// (generate-image/route.ts's RESIZE_IMAGE_MODEL) — replaced the old
// gemini-3.1-flash-image-preview OpenRouter path.
const HERO_IMAGE_MODEL = "gpt-image-2.5-flare";

type Body = {
  brand?: string;
  heroTitle?: string;
  body?: string;
  logoBase64?: string;
  logoMode?: "reference" | "overlay";
  // "Сделать лендинг из баннера": the approved banner, passed as a visual
  // STYLE reference (palette/mood/lighting) for a fresh background image —
  // never reproduced as-is, never its text/logo/composition.
  styleReferenceImage?: string;
  model?: string;
  // Optional: one of our banner-preset templates (with {SUBJECT} already filled).
  // When present, its visual style drives the image instead of the free agent.
  presetTemplate?: string;
  // Optional image aspect ratio (default "3:2"). Use e.g. "3:4" for a vertical
  // character portrait.
  aspectRatio?: string;
  // Optional usage tag for per-user spend breakdown (e.g. "email-hero",
  // "landing-bg", "landing-character").
  feature?: string;
};

const NO_TEXT =
  "ABSOLUTELY NO text, letters, words, captions, watermarks or logos anywhere in the image. " +
  "Numbers/digits are allowed. Leave clean negative space for text to be overlaid later.";

async function composePrompt(brief: string, apiKey: string): Promise<string> {
  const system =
    "Ты — арт-директор. По брифу email-рассылки составь ОДИН промпт на английском для " +
    "генерации hero-баннера письма (тематика iGaming: казино/слоты/беттинг). Опиши сюжет, " +
    "персонажа или объект по офферу, атмосферу, свет, стиль (кинематографично, премиально). " +
    "Композиция — рекламный баннер с чистыми зонами. " +
    NO_TEXT +
    " Верни ТОЛЬКО промпт, без пояснений и кавычек.";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: system },
          { role: "user", content: brief.slice(0, 4000) },
        ],
      }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const brief = [
    body.brand ? `Бренд: ${body.brand}.` : "",
    body.heroTitle ? `Оффер/заголовок: ${body.heroTitle}.` : "",
    body.body ? `Текст письма: ${body.body}.` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\*\*/g, "")
    .trim();

  // A chosen preset drives the visual style directly; otherwise the agent
  // composes a prompt from the brief (which must then be non-empty).
  const preset = (body.presetTemplate || "").trim();
  if (!preset && !brief) return Response.json({ error: "Пустой бриф" }, { status: 400 });
  const base = preset
    ? preset
    : (await composePrompt(brief, apiKey)) || `Cinematic iGaming promotional hero banner for: ${brief}`;
  const prompt = `${base}\n\n${NO_TEXT}`;

  // Reference images (up to 4, per OpenAI's /v1/images/edits limit): the
  // brand logo (style-only, never drawn) and/or a style-reference banner
  // (palette/mood/lighting only, never its composition/text/logo).
  const refs: { dataUrl: string; note: string }[] = [];
  if (body.logoBase64 && body.logoMode === "reference" && body.logoBase64.startsWith("data:")) {
    refs.push({
      dataUrl: body.logoBase64,
      note: "Reference the brand's colours/mood from this logo, but do NOT draw the logo or any text.",
    });
  }
  if (body.styleReferenceImage && body.styleReferenceImage.startsWith("data:")) {
    refs.push({
      dataUrl: body.styleReferenceImage,
      note:
        "STYLE REFERENCE: the attached image is an approved ad banner. Match its colour palette, " +
        "lighting and overall mood for this NEW background — do NOT reproduce its composition, " +
        "any person, text, logo or button.",
    });
  }

  const aspectRatio = (body.aspectRatio || "").trim() || "3:2";
  const size = openAiSizeString(aspectRatio);
  const fullPrompt = (prompt + (refs.length ? "\n\n" + refs.map((r) => r.note).join("\n") : "")).slice(
    0,
    4000,
  );

  let res: Response;
  try {
    if (refs.length > 0) {
      const form = new FormData();
      form.append("model", HERO_IMAGE_MODEL);
      form.append("prompt", fullPrompt);
      form.append("size", size);
      form.append("quality", "medium");
      form.append("n", "1");
      // Relax over-eager moderation — legit iGaming creatives with a person
      // are otherwise sometimes false-flagged as sexual content.
      form.append("moderation", "low");
      for (let i = 0; i < refs.length; i++) {
        const r = refs[i];
        const refResp = await fetch(r.dataUrl);
        const refBuf = Buffer.from(await refResp.arrayBuffer());
        const refType = r.dataUrl.match(/^data:([^;]+);/)?.[1] || "image/png";
        form.append(refs.length > 1 ? "image[]" : "image", new Blob([refBuf], { type: refType }), `ref-${i}.png`);
      }
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } else {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: HERO_IMAGE_MODEL,
          prompt: fullPrompt,
          size,
          quality: "medium",
          n: 1,
          moderation: "low",
        }),
      });
    }
  } catch (e) {
    return Response.json(
      { error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message || msg;
    } catch {
      /* not JSON */
    }
    const isFilter = /safety|moderation|content|rejected/i.test(msg);
    return Response.json(
      { error: isFilter ? "content_filter" : "Provider error", detail: msg },
      { status: isFilter ? 422 : 502 },
    );
  }

  let b64 = "";
  try {
    b64 = (JSON.parse(text) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json || "";
  } catch {
    /* ignore */
  }
  if (!b64) return Response.json({ error: "No image payload" }, { status: 502 });
  const imageUrl = `data:image/png;base64,${b64}`;

  // Best-effort per-user log. OpenAI's images API returns no usage.cost, so we
  // record the event with cost 0 (same convention as generate-character.ts).
  const authed = await optionalUser(request);
  if (authed) {
    await recordUsage(authed.id, {
      model: HERO_IMAGE_MODEL,
      feature: (body.feature || "").trim() || "hero-image",
      type: "image",
      costUsd: 0,
    });
  }

  return Response.json({ imageUrl, prompt, costUsd: 0 });
}
