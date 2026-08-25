// Generate an email hero banner from the email brief.
//
// 1) An "art director" agent (gpt-4o-mini, system key) turns the brief into ONE
//    image prompt — cinematic iGaming hero, and CRITICALLY: no text/letters/words
//    in the image (numbers allowed), so the email stays easy to translate.
// 2) An image model (OpenRouter) renders it. A logo can be passed as a style
//    REFERENCE (never rendered as-is). "Overlay" mode is handled on the client.
//
// Body: { brand?, heroTitle?, body?, logoBase64?, logoMode?, model? }
// Response: { imageUrl (data URL), prompt }
export const runtime = "nodejs";

type Body = {
  brand?: string;
  heroTitle?: string;
  body?: string;
  logoBase64?: string;
  logoMode?: "reference" | "overlay";
  model?: string;
};

const NO_TEXT =
  "ABSOLUTELY NO text, letters, words, captions, watermarks or logos anywhere in the image. " +
  "Numbers/digits are allowed. Leave clean negative space for text to be overlaid later.";

async function composePrompt(brief: string): Promise<string> {
  const providers = [
    process.env.OPENAI_API_KEY && {
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
    },
    process.env.OPENROUTER_API_KEY && {
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: "openai/gpt-4o-mini",
    },
  ].filter(Boolean) as { url: string; key: string; model: string }[];
  if (!providers.length) return "";

  const system =
    "Ты — арт-директор. По брифу email-рассылки составь ОДИН промпт на английском для " +
    "генерации hero-баннера письма (тематика iGaming: казино/слоты/беттинг). Опиши сюжет, " +
    "персонажа или объект по офферу, атмосферу, свет, стиль (кинематографично, премиально). " +
    "Композиция — рекламный баннер с чистыми зонами. " +
    NO_TEXT +
    " Верни ТОЛЬКО промпт, без пояснений и кавычек.";

  for (const p of providers) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.7,
          messages: [
            { role: "system", content: system },
            { role: "user", content: brief.slice(0, 4000) },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const out = data.choices?.[0]?.message?.content?.trim();
      if (out) return out;
    } catch {
      /* try next provider */
    }
  }
  return "";
}

// Pull an image (data URL or http URL) out of an OpenRouter chat/completions body.
function extractImage(data: unknown): string | null {
  const msg = (data as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]?.message;
  if (!msg) return null;
  const images = msg.images as Array<{ image_url?: { url?: string } | string }> | undefined;
  if (Array.isArray(images) && images[0]) {
    const iu = images[0].image_url;
    const url = typeof iu === "string" ? iu : iu?.url;
    if (url) return url;
  }
  const direct = msg.image_url as { url?: string } | string | undefined;
  if (direct) return typeof direct === "string" ? direct : (direct.url ?? null);
  if (typeof msg.content === "string") {
    const m = msg.content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    if (m) return m[0];
  }
  return null;
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "image/png";
  return `data:${ct};base64,${buf.toString("base64")}`;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    return Response.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
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
  if (!brief) return Response.json({ error: "Пустой бриф" }, { status: 400 });

  const composed = await composePrompt(brief);
  const prompt = `${composed || `Cinematic iGaming promotional hero banner for: ${brief}`}\n\n${NO_TEXT}`;

  // Build the image request. A logo (reference mode) is added as an input image
  // with an explicit instruction not to reproduce it.
  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt.slice(0, 6000) }];
  if (body.logoBase64 && body.logoMode === "reference") {
    userContent.push({ type: "text", text: "Reference the brand's colours/mood from this logo, but do NOT draw the logo or any text." });
    userContent.push({ type: "image_url", image_url: { url: body.logoBase64 } });
  }

  const model = (body.model || "").trim() || "google/gemini-3.1-flash-image-preview";
  let raw: string | null = null;
  let detail = "";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${orKey}`,
        "HTTP-Referer": "https://dream-weaver-studio.local",
        "X-Title": "Gen Go",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userContent }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: "3:2" },
        aspect_ratio: "3:2",
      }),
    });
    if (!res.ok) {
      detail = (await res.text()).slice(0, 300);
    } else {
      raw = extractImage(await res.json());
    }
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }

  if (!raw) {
    return Response.json({ error: "Не удалось сгенерировать картинку", detail }, { status: 502 });
  }

  let imageUrl: string;
  try {
    imageUrl = await toDataUrl(raw);
  } catch (e) {
    return Response.json(
      { error: "Не удалось загрузить картинку", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  return Response.json({ imageUrl, prompt });
}
