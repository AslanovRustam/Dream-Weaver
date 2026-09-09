// Generate a landing character as a TRANSPARENT PNG directly from OpenAI
// gpt-image-2 (background:"transparent"). No rembg cutout needed — the model
// returns a clean alpha channel. Used by the wheel/slot/crash landing builders.
//
// Body: { prompt: string }
// Response: { imageUrl (data:image/png;base64,…), costUsd }
import { optionalUser } from "@/lib/auth-server";
import { recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
// gpt-image-2 can take ~20–30s per image; keep the function alive long enough.
export const maxDuration = 300;

type Body = { prompt?: string };

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

  // Portrait for a wheel/slot flanking character. Force a fully transparent
  // background (no scene/floor/shadow) + a people-safety clause so OpenAI's
  // filter doesn't false-flag it.
  const full =
    `${prompt}\n\nOUTPUT: isolate the character on a FULLY TRANSPARENT background — no scene, no floor, ` +
    `no shadow, no backdrop, no props behind. Full body, centered, crisp clean edges. ` +
    `PEOPLE: any person is an adult, FULLY CLOTHED in tasteful attire, natural non-sexual pose.`;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: full,
        size: "1024x1536",
        quality: "medium",
        n: 1,
        background: "transparent",
        output_format: "png",
        moderation: "low",
      }),
    });
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
      model: "gpt-image-2",
      feature: "landing-character",
      type: "image",
      costUsd: 0,
    });
  }

  return Response.json({ imageUrl, costUsd: 0 });
}
