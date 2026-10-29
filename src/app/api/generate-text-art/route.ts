// Лист надписей для баннеров, собираемых слоями (тонкие форматы): модель рисует
// слова баннера в стиле мастера — объёмные, на прозрачном фоне, по слову в строке.
// Сервер режет лист на слова (по альфе) и сверяет написание по картинке (gpt-4o-mini);
// слова, которые не сошлись, клиент рисует шрифтом. Подробности — src/lib/textArt.ts.
//
// Body: { tokens: {text, role: "light"|"accent"|"button"}[], style_image: data:image/… (мастер) }
// Response: { pieces: {text, src, w, h, ok}[], costUsd, costCredits, balance }
import sharp from "sharp";
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { chargeFlat, refundFlat } from "@/lib/billing";
import { PLAYABLE_ASSET_PRICE_CREDITS } from "@/lib/credit-estimate";
import { recordUsage } from "@/lib/usage";
import { imageUsageFromResponse } from "@/lib/openai-pricing";
import { bandsFromAlpha, sameWord, type ArtToken } from "@/lib/textArt";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "gpt-image-2.5-sunburst";
const MAX_TOKENS = 14;

type Body = { tokens?: ArtToken[]; style_image?: string };

function sheetPrompt(tokens: ArtToken[]): string {
  return [
    "TASK: a TYPOGRAPHY ASSET SHEET for an advertising banner. Render ONLY the items listed below, nothing else.",
    "STYLE: take the lettering style, materials, colours and mood from the attached banner (premium casino / game key-art lettering): bold heavy display letters with real 3D volume — bevel, extrusion depth, glossy specular highlights, rim light, a crisp dark outline and a soft drop shadow, like the title lettering of a premium slot game. All items must share ONE consistent style.",
    "Role colours: LIGHT items — bright white-to-pale-gold metal face; ACCENT items — rich glowing face in the banner's main accent colour (gold if unsure). Same extrusion and outline for both.",
    `LAYOUT: exactly ${tokens.length} rows, ONE item per row, top to bottom in this exact order, each row horizontally centred, all rows the same letter height, generous EMPTY space between rows so that no two rows touch or overlap (shadows included). Do not add, merge, split, translate or reorder anything.`,
    "BUTTON rows: draw a complete call-to-action BUTTON — a glossy 3D rounded pill in the banner's main accent colour (bevel, top highlight, soft outer glow and drop shadow, like a premium game UI button), about 4 times wider than tall, with the given label centred on it in bold heavy letters (dark on light buttons, white on dark ones). The label must fit inside the pill with comfortable padding.",
    ...tokens.map((t, i) => `  Row ${i + 1}: "${t.text}" (${t.role === "accent" ? "ACCENT" : t.role === "button" ? "BUTTON" : "LIGHT"})`),
    "Spell every item EXACTLY character-for-character (Cyrillic stays Cyrillic, digits stay digits). No other text, no logos, no frames, no decorations, no background scene.",
    "BACKGROUND: fully transparent.",
  ].join("\n");
}

/** Читает слова с листа по порядку (vision); null — не удалось. */
async function readSheet(png: Buffer, n: number, apiKey: string): Promise<string[] | null> {
  try {
    const small = await sharp(png).flatten({ background: "#2a2f3a" }).resize({ width: 640 }).jpeg({ quality: 80 }).toBuffer();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Read the ${n} rows of lettering in the image, top to bottom, EXACTLY as drawn (do not correct spelling). Return JSON {"rows": string[]}.` },
          { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${small.toString("base64")}` } }] },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const rows = (JSON.parse(data.choices?.[0]?.message?.content || "{}") as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows.map((r) => String(r)) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("generate-text-art", user.id, 10, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 12 * 1024 * 1024);
  if (big) return big;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const tokens = (body.tokens ?? [])
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .slice(0, MAX_TOKENS)
    .map((t) => ({ text: t.text.trim().slice(0, 40), role: t.role === "accent" || t.role === "button" ? t.role : "light" }) as ArtToken);
  if (!tokens.length) return Response.json({ error: "Нет слов" }, { status: 400 });
  const style = body.style_image ?? "";
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(style);
  if (!m) return Response.json({ error: "Нет картинки-образца" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const billing = { feature: "banner-text-art", model: MODEL };
  const supa = getAdminClient();
  const charge = await chargeFlat(supa, user.id, PLAYABLE_ASSET_PRICE_CREDITS, billing);
  if (!charge.ok) return charge.response;
  const refund = () => refundFlat(supa, user.id, PLAYABLE_ASSET_PRICE_CREDITS, { ...billing, reason: "provider_failure" });

  // Листу хватает места: 14 строк по ~110 px на 1024×1536.
  const fd = new FormData();
  fd.append("model", MODEL);
  fd.append("prompt", sheetPrompt(tokens));
  fd.append("size", "1024x1536");
  fd.append("quality", "high");
  fd.append("background", "transparent");
  fd.append("output_format", "png");
  fd.append("moderation", "low");
  fd.append("image[]", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), "style.png");

  let text = "";
  let ok = false;
  try {
    const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
    text = await res.text();
    ok = res.ok;
  } catch (e) {
    await refund();
    return Response.json({ error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  let json: unknown = null;
  let b64 = "";
  try {
    json = JSON.parse(text);
    b64 = (json as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json || "";
  } catch {
    /* not JSON */
  }
  if (!ok || !b64) {
    await refund();
    let msg = text.slice(0, 300);
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message || msg;
    } catch {
      /* not JSON */
    }
    return Response.json({ error: "Не удалось нарисовать надписи", detail: msg }, { status: 502 });
  }
  const png = Buffer.from(b64, "base64");
  const iu = imageUsageFromResponse(json);
  await recordUsage(user.id, {
    model: MODEL,
    feature: "banner-text-art",
    type: "image",
    promptTokens: iu.inputText,
    inputImageTokens: iu.inputImage,
    completionTokens: iu.output,
    totalTokens: iu.total,
    costUsd: iu.costUsd,
  });

  // Режем по альфе: полоса на слово, внутри — обрезка по непрозрачному.
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const rowsInk = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 40) rowsInk[y]++;
  const bands = bandsFromAlpha(rowsInk, tokens.length);
  if (!bands) {
    return Response.json({ pieces: [], error: "Лист не разрезался на слова", costUsd: iu.costUsd, costCredits: PLAYABLE_ASSET_PRICE_CREDITS, balance: charge.balance });
  }
  const read = await readSheet(png, tokens.length, apiKey);
  const pieces = await Promise.all(
    bands.map(async ([y0, y1], i) => {
      let x0 = W;
      let x1 = 0;
      for (let y = y0; y < y1; y++)
        for (let x = 0; x < W; x++)
          if (data[(y * W + x) * 4 + 3] > 40) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
          }
      const pad = 4;
      const left = Math.max(0, x0 - pad);
      const top = Math.max(0, y0 - pad);
      const width = Math.min(W, x1 + pad + 1) - left;
      const height = Math.min(H, y1 + pad) - top;
      const buf = await sharp(png).extract({ left, top, width, height }).png().toBuffer();
      return {
        text: tokens[i].text,
        role: tokens[i].role,
        src: `data:image/png;base64,${buf.toString("base64")}`,
        w: width,
        h: height,
        // Сверка: прочитанное совпало со словом. Нет чтения — не рискуем.
        ok: !!read && read.length === tokens.length && sameWord(read[i], tokens[i].text),
      };
    }),
  );

  return Response.json({ pieces, costUsd: iu.costUsd, costCredits: PLAYABLE_ASSET_PRICE_CREDITS, balance: charge.balance });
}
