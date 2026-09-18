// Generate a landing character as a TRANSPARENT PNG directly from OpenAI
// gpt-image-2.5-sunburst. No rembg cutout needed — the model returns a clean
// alpha channel. Used by the wheel/slot/crash landing builders.
//
// Body: { prompt: string, reference_image?: string }
//   reference_image (optional) — an approved banner used as a STYLE reference
//   (see "Сделать лендинг из баннера"): when present we call the i2i
//   /v1/images/edits endpoint instead of plain text-to-image, so the
//   generated character's palette/attire/style echoes the banner instead of
//   being invented from the text prompt alone.
// Response: { imageUrl (data:image/png;base64,…), costUsd }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, assertImageDataUrl, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { chargeFlat, refundFlat } from "@/lib/billing";
import { CHARACTER_PRICE_CREDITS } from "@/lib/credit-estimate";
import { recordUsage } from "@/lib/usage";
import { imageUsageFromResponse } from "@/lib/openai-pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHARACTER_IMAGE_MODEL = "gpt-image-2.5-sunburst";

type Body = { prompt?: string; reference_image?: string };

export async function POST(request: Request) {
  // Paid call on the company's OpenAI key: sign-in + a per-user rate limit are
  // mandatory. This used to be `optionalUser` (never throws) with no limit —
  // anyone who knew the URL could drain the key anonymously.
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("generate-character", user.id, 10, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 25 * 1024 * 1024);
  if (big) return big;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Size cap + magic bytes: the client's MIME/extension is never trusted.
  const badRef = assertImageDataUrl("reference_image", body.reference_image);
  if (badRef) return badRef;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const prompt = (body.prompt || "").trim().slice(0, 4000);
  if (!prompt) return Response.json({ error: "Пустой промпт" }, { status: 400 });

  const reference = (body.reference_image || "").trim();
  const hasReference = reference.startsWith("data:");

  // Portrait for a wheel/slot flanking character. Force a fully transparent
  // background (no scene/floor/shadow) + a people-safety clause so OpenAI's
  // filter doesn't false-flag it.
  const referenceClause = hasReference
    ? "\n\nIDENTITY REFERENCE: the attached image is the approved ad banner this landing page is built " +
      "from. If it shows a person/character, this is the SAME character — reproduce them with matching " +
      "identity: same hair colour/style, same face shape and features, same outfit and colours, same " +
      "distinctive accessories or markings. The viewer must recognise it as the exact same character seen " +
      "on the banner, not a different-looking reinterpretation. You MAY change the pose/angle to a clean " +
      "standalone full-body stance, and you MUST discard the banner's original background, props, text and " +
      "logo — only the character itself carries over. If the banner shows NO person, use it only as a " +
      "colour-palette and art-style reference for this character."
    : "";
  const full =
    `${prompt}${referenceClause}\n\nOUTPUT: isolate the character on a FULLY TRANSPARENT background — no scene, no floor, ` +
    `no shadow, no backdrop, no props behind. Full body, centered, crisp clean edges. ` +
    `PEOPLE: any person is an adult, FULLY CLOTHED in tasteful attire, natural non-sexual pose.`;

  // Flat price is known up front, so: charge → call the provider → refund
  // if the provider fails. A user who can't pay never triggers a paid call,
  // and the company never eats a generation that isn't billed.
  const billing = { feature: "landing-character", model: CHARACTER_IMAGE_MODEL };
  const supa = getAdminClient();
  const charge = await chargeFlat(supa, user.id, CHARACTER_PRICE_CREDITS, billing);
  if (!charge.ok) return charge.response;
  const refund = () => refundFlat(supa, user.id, CHARACTER_PRICE_CREDITS, { ...billing, reason: "provider_failure" });

  let res: Response;
  try {
    if (hasReference) {
      const refResp = await fetch(reference);
      const refBuf = Buffer.from(await refResp.arrayBuffer());
      const refType = reference.match(/^data:([^;]+);/)?.[1] || "image/png";

      const form = new FormData();
      form.append("model", CHARACTER_IMAGE_MODEL);
      form.append("prompt", full);
      form.append("size", "1024x1536");
      form.append("quality", "medium");
      form.append("output_format", "png");
      form.append("background", "transparent");
      form.append("moderation", "low");
      form.append("n", "1");
      form.append("image", new Blob([refBuf], { type: refType }), "reference.png");

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
          model: CHARACTER_IMAGE_MODEL,
          prompt: full,
          size: "1024x1536",
          quality: "medium",
          n: 1,
          background: "transparent",
          output_format: "png",
          moderation: "low",
        }),
      });
    }
  } catch (e) {
    await refund();
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
  const imageUrl = `data:image/png;base64,${b64}`;

  const iu = imageUsageFromResponse(json);
  await recordUsage(user.id, {
    model: CHARACTER_IMAGE_MODEL,
    feature: "landing-character",
    type: "image",
    promptTokens: iu.inputText,
    inputImageTokens: iu.inputImage,
    completionTokens: iu.output,
    totalTokens: iu.total,
    costUsd: iu.costUsd,
  });

  return Response.json({ imageUrl, costUsd: iu.costUsd, costCredits: CHARACTER_PRICE_CREDITS, balance: charge.balance });
}
