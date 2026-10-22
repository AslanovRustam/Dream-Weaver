// Картинки для сценарных плейблов: рама колеса, указатель, центр, фон сцены,
// награда. OpenAI gpt-image-2.5-sunburst — тот же класс, что персонажи
// лендингов, но промпты собраны здесь под каждую деталь: деталь должна лечь
// в сцену без ручной правки (вид строго спереди, по центру, без текста).
//
// Body: { kind: PlayableAssetKind, style: string, theme?: string }
//   style — стилевой промпт пресета (материалы, палитра): один на все детали
//   сцены, чтобы они выглядели из одного набора.
// Response: { imageUrl (data:image/png;base64,…), costUsd, costCredits, balance }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { chargeFlat, refundFlat } from "@/lib/billing";
import { PLAYABLE_ASSET_PRICE_CREDITS } from "@/lib/credit-estimate";
import { recordUsage } from "@/lib/usage";
import { imageUsageFromResponse } from "@/lib/openai-pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "gpt-image-2.5-sunburst";

const COMMON =
  "Premium mobile casino game asset, high-end 3D render, glossy polished materials, rich fine detail, " +
  "dramatic studio lighting with crisp specular highlights, vivid saturated colours. " +
  "ABSOLUTELY NO text, letters, numbers, logos or watermarks anywhere.";

type Spec = { prompt: string; size: string; transparent: boolean; quality: "medium" | "high" };

const KINDS: Record<string, Spec> = {
  "wheel-frame": {
    prompt:
      "A single ornate circular FRAME RING for a fortune wheel, seen perfectly straight-on (flat front " +
      "orthographic view — not tilted, no perspective), perfectly round, centred, filling about 96% of the " +
      "square canvas. The band of the ring is fairly thin: about 9% of the diameter. 16 evenly spaced glowing " +
      "light bulbs are embedded all around the band. The CENTRE of the ring is a completely EMPTY transparent " +
      "hole: draw NO wheel, NO segments, NO spokes, NO hub inside it, and NO pointer, NO stand, NO base outside it. " +
      "Transparent background everywhere outside the ring.",
    size: "1024x1024",
    transparent: true,
    quality: "high",
  },
  "wheel-pointer": {
    prompt:
      "A single fortune-wheel POINTER (ticker), seen straight-on from the front: a symmetrical jewelled " +
      "ornament, vertical, that tapers to one sharp tip pointing straight DOWN. Centred, nothing else in the " +
      "image, transparent background.",
    size: "1024x1024",
    transparent: true,
    quality: "medium",
  },
  "wheel-hub": {
    prompt:
      "A single round central HUB cap for a fortune wheel, seen perfectly straight-on, perfectly circular, " +
      "centred and filling about 90% of the canvas: a domed medallion with an embossed emblem in the middle that " +
      "fits the THEME (a big faceted gem or a star if there is no theme). Nothing else in the image, transparent background.",
    size: "1024x1024",
    transparent: true,
    quality: "medium",
  },
  // Квадрат 2048: один фон на обе ориентации. Сцена — 1080×1920 или 1920×1080,
  // фон ложится «cover» и только уменьшается; в вертикали срезаются бока, в
  // горизонтали — верх и низ, поэтому всё важное — ближе к центру.
  "scene-bg": {
    prompt:
      "A SQUARE 1:1 BACKGROUND for a casino mini-game ad that will be shown both on vertical phone screens " +
      "and on horizontal desktop screens, so the outer edges WILL BE CROPPED: keep every important element " +
      "within the central 55% of the frame, and let the edges continue the environment naturally (no " +
      "important objects, no hard lines cut at the edges). Immersive environment with depth, bokeh lights and " +
      "atmosphere, symmetric-feeling composition. The very centre (where the game object will be placed) is " +
      "calmer and slightly darker with a soft glowing halo. NO game object, NO wheel, NO characters, NO people, " +
      "NO UI, NO frames or borders.",
    size: "2048x2048",
    transparent: false,
    quality: "high",
  },
  reward: {
    prompt:
      "A single prize object for a game win popup: a heap of treasure — gold coins, gold bars and a few " +
      "gems, compact, centred, seen slightly from above. No people, nothing else, transparent background.",
    size: "1024x1024",
    transparent: true,
    quality: "medium",
  },
};


/**
 * Предмет сцены по описанию из пресета (сундук, самолёт, дверь сейфа…):
 * описание приходит в subject, рамка промпта — здесь.
 */
function objectSpec(subject: string): Spec {
  return {
    prompt:
      `A single game object: ${subject}. ` +
      "REINTERPRET it to fit the THEME below: keep its role in the game, its rough silhouette and every layout rule above, " +
      "but take materials, shape details, ornaments and motifs from the theme (e.g. a bank safe door becomes a dragon-scale vault " +
      "in fantasy or a witch's sealed cabinet in mystic; a chest becomes a crystal casket). " +
      "Centred with a little padding, nothing else in the image, crisp clean " +
      "edges, transparent background, no ground, no shadow plate. PEOPLE: any person is an adult, fully clothed, " +
      "friendly non-sexual pose, and ALWAYS an ORIGINAL generic character: if the theme names a superhero, film, game or " +
      "celebrity, take only its colours and mood — never its costume, emblem, mask, face or likeness.",
    size: "1024x1024",
    transparent: true,
    quality: "medium",
  };
}

type Body = { kind?: string; style?: string; theme?: string; subject?: string };

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("generate-playable-asset", user.id, 12, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 64 * 1024);
  if (big) return big;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const subject = (body.subject || "").trim().slice(0, 600);
  const spec = body.kind === "object" ? (subject ? objectSpec(subject) : null) : KINDS[body.kind ?? ""];
  if (!spec) return Response.json({ error: "Неизвестная деталь" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const style = (body.style || "").trim().slice(0, 600);
  const theme = (body.theme || "").trim().slice(0, 400);
  const prompt =
    `${spec.prompt}\n\nSTYLE (shared by every asset of this game — keep it consistent): ${style || "polished gold and ruby, luxury casino"}.` +
    (theme ? `\nTHEME: ${theme}.` : "") +
    `\n\n${COMMON}`;

  const billing = { feature: `playable-${body.kind}`, model: MODEL };
  const supa = getAdminClient();
  const charge = await chargeFlat(supa, user.id, PLAYABLE_ASSET_PRICE_CREDITS, billing);
  if (!charge.ok) return charge.response;
  const refund = () => refundFlat(supa, user.id, PLAYABLE_ASSET_PRICE_CREDITS, { ...billing, reason: "provider_failure" });

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        size: spec.size,
        quality: spec.quality,
        n: 1,
        background: spec.transparent ? "transparent" : "opaque",
        output_format: spec.transparent ? "png" : "jpeg",
        moderation: "low",
      }),
    });
  } catch (e) {
    await refund();
    return Response.json({ error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
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
    await refund();
    return Response.json({ error: isFilter ? "content_filter" : "Provider error", detail: msg }, { status: isFilter ? 422 : 502 });
  }

  let b64 = "";
  let json: unknown = null;
  try {
    json = JSON.parse(text);
    b64 = (json as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json || "";
  } catch {
    /* ignore */
  }
  if (!b64) {
    await refund();
    return Response.json({ error: "No image payload" }, { status: 502 });
  }
  const imageUrl = `data:image/${spec.transparent ? "png" : "jpeg"};base64,${b64}`;

  const iu = imageUsageFromResponse(json);
  await recordUsage(user.id, {
    model: MODEL,
    feature: `playable-${body.kind}`,
    type: "image",
    promptTokens: iu.inputText,
    inputImageTokens: iu.inputImage,
    completionTokens: iu.output,
    totalTokens: iu.total,
    costUsd: iu.costUsd,
  });

  return Response.json({ imageUrl, costUsd: iu.costUsd, costCredits: PLAYABLE_ASSET_PRICE_CREDITS, balance: charge.balance });
}
