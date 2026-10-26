// Картинки для сценарных плейблов: рама колеса, указатель, центр, фон сцены,
// награда. OpenAI gpt-image-2.5-sunburst — тот же класс, что персонажи
// лендингов, но промпты собраны здесь под каждую деталь: деталь должна лечь
// в сцену без ручной правки (вид строго спереди, по центру, без текста).
//
// Body: { kind: PlayableAssetKind, style: string, theme?: string, subject?: string, person?: boolean }
//   style — стилевой промпт пресета (материалы, палитра): один на все детали
//   сцены, чтобы они выглядели из одного набора.
//   person — на детали человек (вратарь, ведущий). Тему-персонажа («супермен»)
//   OpenAI не рисует: блокирует уже готовую картинку. Поэтому для людей тему
//   сначала переписываем в безымянный бриф образа (цвета, крой, плащ — без
//   имени, эмблем и лица героя), а если и такой образ заблокируют — рисуем
//   своего персонажа только в цветах темы. Кредиты — один раз за деталь.
// Response: { imageUrl (data:image/png;base64,…), costUsd, costCredits, balance }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { chargeFlat, refundFlat } from "@/lib/billing";
import { PLAYABLE_ASSET_PRICE_CREDITS } from "@/lib/credit-estimate";
import { recordUsage } from "@/lib/usage";
import { grokConfigured, grokGenerate, grokOnFailure, grokPrimary } from "@/lib/grokImage";
import { imageUsageFromResponse } from "@/lib/openai-pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "gpt-image-2.5-sunburst";

const COMMON =
  "Premium mobile casino game asset, high-end 3D render, glossy polished materials, rich fine detail, " +
  "dramatic studio lighting with crisp specular highlights, vivid saturated colours. " +
  "ABSOLUTELY NO text, letters, numbers, logos or watermarks anywhere.";
/** То же для Grok, когда рисуем персонажа темы: эмблема — часть образа. */
const COMMON_MARKS = COMMON.replace(
  "ABSOLUTELY NO text, letters, numbers, logos or watermarks anywhere.",
  "No captions, random text or watermarks; the character's own emblem and insignia are part of the look.",
);

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
/** marks — образ персонажа темы целиком, с эмблемой (только для Grok: OpenAI такое не пропускает). */
function objectSpec(subject: string, marks = false): Spec {
  return {
    prompt:
      `A single game object: ${subject}. ` +
      "REINTERPRET it to fit the THEME below: keep its role in the game, its rough silhouette and every layout rule above, " +
      "but take materials, shape details, ornaments and motifs from the theme (e.g. a bank safe door becomes a dragon-scale vault " +
      "in fantasy or a witch's sealed cabinet in mystic; a chest becomes a crystal casket). " +
      "Centred with a little padding, nothing else in the image, crisp clean " +
      "edges, transparent background, no ground, no shadow plate. PEOPLE: any person is an adult, fully clothed, " +
      (marks
        ? "friendly non-sexual pose, wearing the full signature costume of the theme's character, emblem and insignia included."
        : "friendly non-sexual pose, with an original friendly face; no emblems, chest symbols, logos or lettering on clothes."),
    size: "1024x1024",
    transparent: true,
    quality: "medium",
  };
}

type Body = { kind?: string; style?: string; theme?: string; subject?: string; person?: boolean };

const BRIEF_SYSTEM = [
  'You prepare art briefs for an image model that refuses to draw known characters. Given a THEME (any language) and a CHARACTER ROLE, return JSON {"setting": string, "costume": string, "named": boolean}.',
  "- named: true if the theme refers to a specific known character, franchise, film, game, team, celebrity or brand.",
  "- setting: 6-15 English words — mood, colour palette, place. No proper names.",
  "- costume: 12-35 English words — an outfit for the given role that fans of the theme would associate with it at a glance: " +
    "colour scheme, materials, cape or armour plates, boots, gloves, accessories, adapted to the role (e.g. a goalkeeper kit). " +
    "Never use names, and never include emblems, chest symbols, logos, letters, masks or cowls that hide the face, " +
    "signature patterns or motifs owned by a character (web lines, bat shapes, lightning bolts, shields, stars of a specific costume), " +
    "signature hairstyles, or facial features of a specific person or character. The face is always an original friendly face.",
  "- If the theme is generic (no named character), describe a fitting themed outfit the same way.",
].join("\n");

/** Безымянный бриф образа по теме для детали с человеком; null — не вышло, рисуем без него. */
async function personBrief(
  theme: string,
  role: string,
  apiKey: string,
): Promise<{ setting: string; costume: string; named: boolean } | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: BRIEF_SYSTEM },
          { role: "user", content: `Theme: ${theme}\nCharacter role: ${role}` },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const j = JSON.parse(data.choices?.[0]?.message?.content || "{}") as {
      setting?: unknown;
      costume?: unknown;
      named?: unknown;
    };
    const setting = typeof j.setting === "string" ? j.setting.trim().slice(0, 200) : "";
    const costume = typeof j.costume === "string" ? j.costume.trim().slice(0, 400) : "";
    return setting && costume ? { setting, costume, named: j.named === true } : null;
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
  const spec =
    body.kind === "object" ? (subject ? objectSpec(subject) : null) : KINDS[body.kind ?? ""];
  if (!spec) return Response.json({ error: "Неизвестная деталь" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const style = (body.style || "").trim().slice(0, 600);
  const theme = (body.theme || "").trim().slice(0, 400);
  const promptFor = (specPrompt: string, th: string, st: string) =>
    `${specPrompt}\n\nSTYLE (shared by every asset of this game — keep it consistent): ${st || "polished gold and ruby, luxury casino"}.` +
    (th ? `\nTHEME: ${th}.` : "") +
    `\n\n${COMMON}`;

  // Попытки по очереди: следующая — только если фильтр заблокировал предыдущую.
  const attempts: string[] = [];
  if (body.kind === "object" && body.person && theme) {
    const brief = await personBrief(theme, subject.slice(0, 120), apiKey);
    if (brief?.named && grokConfigured()) {
      // Тема — известный персонаж, а Grok подключён: просим OpenAI полный образ с эмблемой.
      // OpenAI такое обычно не пропускает — тогда тот же промпт рисует Grok (grokOnFailure ниже).
      attempts.push(
        `${objectSpec(subject, true).prompt}\n\nSTYLE (shared by every asset of this game — keep it consistent): ${style}.\nTHEME: ${theme}.\n\n${COMMON_MARKS}`,
      );
    } else {
      // имя темы не должно попасть в промпт и через стиль («…taken from the theme "супермен"»)
      const safe = (s: string, to: string) => s.split(theme).join(to);
      if (brief) {
        attempts.push(
          promptFor(
            objectSpec(`${subject}. Outfit: ${brief.costume}`).prompt,
            brief.setting,
            safe(style, brief.setting),
          ),
        );
      }
      const setting = brief?.setting || "the theme's colour palette";
      attempts.push(
        promptFor(
          objectSpec(
            `${subject}. An ORIGINAL generic character in a plain outfit using only the colour palette of the setting — no cape, mask, costume or motif of any known hero`,
          ).prompt,
          setting,
          safe(style, setting),
        ),
      );
    }
  } else {
    attempts.push(promptFor(spec.prompt, theme, style));
  }

  const billing = { feature: `playable-${body.kind}`, model: MODEL };
  const supa = getAdminClient();
  const charge = await chargeFlat(supa, user.id, PLAYABLE_ASSET_PRICE_CREDITS, billing);
  if (!charge.ok) return charge.response;
  const refund = () =>
    refundFlat(supa, user.id, PLAYABLE_ASSET_PRICE_CREDITS, {
      ...billing,
      reason: "provider_failure",
    });

  let res!: Response;
  let text = "";
  // Ручной тест (IMAGE_PROVIDER=grok): вся деталь сразу в Grok, OpenAI не вызывается.
  const direct = grokPrimary()
    ? await grokGenerate({
        prompt: attempts[0],
        size: spec.size,
        transparent: spec.transparent,
        format: spec.transparent ? "png" : "jpeg",
      })
    : null;
  if (!direct)
    for (let i = 0; i < attempts.length; i++) {
      try {
        res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: MODEL,
            prompt: attempts[i],
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
        return Response.json(
          { error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) },
          { status: 502 },
        );
      }

      text = await res.text();
      // Заблокировал фильтр, а есть попытка помягче — пробуем её.
      if (!res.ok && i < attempts.length - 1 && /safety|moderation|content|rejected/i.test(text))
        continue;
      break;
    }
  // OpenAI так и не дал картинку (фильтр на всех попытках, перегрузка, лимиты) — первая попытка уходит в Grok.
  const grok = direct
    ? {
        text: JSON.stringify({ data: [{ b64_json: direct.b64 }] }),
        costUsd: direct.costUsd,
        model: direct.model,
      }
    : await grokOnFailure(res.ok, {
        prompt: attempts[0],
        size: spec.size,
        transparent: spec.transparent,
        format: spec.transparent ? "png" : "jpeg",
      });
  if (grok) text = grok.text;
  if (!grok && !res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message || msg;
    } catch {
      /* not JSON */
    }
    const isFilter = /safety|moderation|content|rejected/i.test(msg);
    await refund();
    return Response.json(
      { error: isFilter ? "content_filter" : "Provider error", detail: msg },
      { status: isFilter ? 422 : 502 },
    );
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
    model: grok?.model ?? MODEL,
    feature: `playable-${body.kind}`,
    type: "image",
    promptTokens: iu.inputText,
    inputImageTokens: iu.inputImage,
    completionTokens: iu.output,
    totalTokens: iu.total,
    costUsd: grok?.costUsd ?? iu.costUsd,
  });

  return Response.json({
    imageUrl,
    costUsd: grok?.costUsd ?? iu.costUsd,
    costCredits: PLAYABLE_ASSET_PRICE_CREDITS,
    balance: charge.balance,
  });
}
