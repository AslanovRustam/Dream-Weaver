// Generate a single premium "crash game" rocket icon as a TRANSPARENT PNG,
// pointing up-and-to-the-right at a fixed ~45° baseline — the SAME
// orientation convention CrashGame.tsx assumes (ROCKET_BASELINE_DEG) so the
// live rotation math that keeps the rocket aligned with the rising trail
// line works for this icon exactly like it does for the 🚀 emoji fallback.
//
// Body: { prompt: string, reference_image?: string }
//   reference_image (optional) — a style reference (e.g. the approved banner
//   or a manually uploaded image): when present we call the i2i
//   /v1/images/edits endpoint so the rocket echoes its palette/material
//   instead of being invented from the text prompt alone.
// Response: { imageUrl (data:image/png;base64,…), costUsd }
import { optionalUser } from "@/lib/auth-server";
import { recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

// Same engine as the character/slot-icon generators — top quality,
// token-billed, supports i2i edits for the reference path.
const ROCKET_IMAGE_MODEL = "gpt-image-2.5-sunburst";

type Body = { prompt?: string; reference_image?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const prompt = (body.prompt || "").trim().slice(0, 4000);
  if (!prompt) return Response.json({ error: "Пустой промпт" }, { status: 400 });

  const reference = (body.reference_image || "").trim();
  const hasReference = reference.startsWith("data:");

  const referenceClause = hasReference
    ? "\n\nSTYLE REFERENCE: match the attached image's color palette and material/mood, but keep the exact " +
      "rocket shape and orientation described below — do not copy the reference's subject or composition, " +
      "only its palette/mood."
    : "";

  const full =
    `A single premium, richly rendered ROCKET SHIP icon for a casino "crash" multiplier game — the polished, ` +
    `high-value AAA game-icon look (thick glossy/glassy or polished-metal material with rich color gradients, ` +
    `strong specular highlights, a bright rim-light glow around the silhouette, a bold dark beveled outline, ` +
    `and a soft drop shadow for depth), NOT a flat vector icon and absolutely NOT a plain flat emoji-style ` +
    `shape — a real chunky 3D-rendered object with a visible flame/exhaust trail. Theme: ${prompt}.\n\n` +
    `CRITICAL ORIENTATION: the rocket must be drawn pointing UP AND TO THE RIGHT at approximately a 45-degree ` +
    `angle from horizontal — nose tip toward the upper-right corner, engine/flame trailing toward the ` +
    `lower-left corner — exactly like the classic 🚀 rocket emoji's tilt. This exact angle matters: do not ` +
    `draw it upright, sideways, or at any other angle.${referenceClause}\n\n` +
    `OUTPUT: centered in frame with generous padding on all sides so nothing touches the edges. FULLY ` +
    `TRANSPARENT background — no scene, no stars, no scorch clouds, no text, no numbering.`;

  let res: Response;
  try {
    if (hasReference) {
      // i2i via /v1/images/edits — the reference is a real input image, not
      // just prose. Fetch/decode it into a Blob for the multipart form.
      const refResp = await fetch(reference);
      const refBuf = Buffer.from(await refResp.arrayBuffer());
      const refType = reference.match(/^data:([^;]+);/)?.[1] || "image/png";

      const form = new FormData();
      form.append("model", ROCKET_IMAGE_MODEL);
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
          model: ROCKET_IMAGE_MODEL,
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
  // record the event with cost 0 (the себестоимость readout can't reflect $).
  const authed = await optionalUser(request);
  if (authed) {
    await recordUsage(authed.id, {
      model: ROCKET_IMAGE_MODEL,
      feature: "landing-crash-rocket",
      type: "image",
      costUsd: 0,
    });
  }

  return Response.json({ imageUrl, costUsd: 0 });
}
