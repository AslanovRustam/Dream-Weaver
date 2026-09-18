// Generate a single invented TEAM CREST / club badge as a TRANSPARENT PNG for
// the "Матч-прогноз" betting landing. Same auth / rate-limit / charge → call →
// refund shape as generate-crash-rocket.
//
// Body: { team: string, sport?: string, theme?: string, reference_image?: string }
// Response: { imageUrl (data:image/png;base64,…), costUsd }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, assertImageDataUrl, rejectLargeBody } from "@/lib/request-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { chargeFlat, refundFlat } from "@/lib/billing";
import { TEAM_CREST_PRICE_CREDITS } from "@/lib/credit-estimate";
import { recordUsage } from "@/lib/usage";
import { imageUsageFromResponse } from "@/lib/openai-pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

const CREST_IMAGE_MODEL = "gpt-image-2.5-sunburst";

type Body = { team?: string; sport?: string; theme?: string; reference_image?: string };

const SPORT_HINT: Record<string, string> = {
  football: "a football (soccer) club",
  basketball: "a basketball team",
  hockey: "an ice-hockey club",
  tennis: "a tennis academy / player brand",
  mma: "a combat-sports fight team",
  esports: "an esports organisation",
};

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("generate-team-crest", user.id, 10, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 25 * 1024 * 1024);
  if (big) return big;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const badRef = assertImageDataUrl("reference_image", body.reference_image);
  if (badRef) return badRef;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const team = (body.team || "").trim().slice(0, 80);
  if (!team) return Response.json({ error: "Укажите название команды" }, { status: 400 });
  const sportHint = SPORT_HINT[(body.sport || "").trim()] || "a sports team";
  const theme = (body.theme || "").trim().slice(0, 500);

  const reference = (body.reference_image || "").trim();
  const hasReference = reference.startsWith("data:");
  const referenceClause = hasReference
    ? "\n\nSTYLE REFERENCE: match the attached image's color palette and mood, but keep the crest shape and " +
      "content described below — do not copy the reference's subject or composition."
    : "";

  const full =
    `A single premium sports club CREST / badge for ${sportHint} named "${team}" — an INVENTED emblem that ` +
    `does not resemble any real club, league or brand logo. Shield or roundel shape, bold heraldic ` +
    `symbol derived from the name (animal, landmark, tool, star), the team name lettered on a ribbon or ` +
    `band, two or three team colors, glossy enamel-and-metal finish with strong specular highlights, a ` +
    `bold dark beveled outline and a soft drop shadow — the polished game-icon look, NOT a flat vector.` +
    (theme ? ` Overall theme / palette wishes: ${theme}.` : "") +
    referenceClause +
    `\n\nOUTPUT: centered in frame with generous padding on all sides. FULLY TRANSPARENT background — no ` +
    `scene, no extra text, no numbering.`;

  const billing = { feature: "landing-team-crest", model: CREST_IMAGE_MODEL };
  const supa = getAdminClient();
  const charge = await chargeFlat(supa, user.id, TEAM_CREST_PRICE_CREDITS, billing);
  if (!charge.ok) return charge.response;
  const refund = () => refundFlat(supa, user.id, TEAM_CREST_PRICE_CREDITS, { ...billing, reason: "provider_failure" });

  let res: Response;
  try {
    if (hasReference) {
      const refResp = await fetch(reference);
      const refBuf = Buffer.from(await refResp.arrayBuffer());
      const refType = reference.match(/^data:([^;]+);/)?.[1] || "image/png";
      const form = new FormData();
      form.append("model", CREST_IMAGE_MODEL);
      form.append("prompt", full);
      form.append("size", "1024x1024");
      form.append("quality", "high");
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
          model: CREST_IMAGE_MODEL,
          prompt: full,
          size: "1024x1024",
          quality: "high",
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

  const iu = imageUsageFromResponse(json);
  await recordUsage(user.id, {
    model: CREST_IMAGE_MODEL,
    feature: "landing-team-crest",
    type: "image",
    promptTokens: iu.inputText,
    inputImageTokens: iu.inputImage,
    completionTokens: iu.output,
    totalTokens: iu.total,
    costUsd: iu.costUsd,
  });
  return Response.json({
    imageUrl: `data:image/png;base64,${b64}`,
    costUsd: iu.costUsd,
    costCredits: TEAM_CREST_PRICE_CREDITS,
    balance: charge.balance,
  });
}
