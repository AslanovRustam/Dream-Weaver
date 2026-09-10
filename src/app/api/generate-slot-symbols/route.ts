// Generate a full set of slot-machine symbol icons in ONE call: the model
// draws all of them as separate, evenly-spaced tiles on a single transparent
// canvas (a fixed grid), and the caller (SlotLandingApp, via
// src/lib/spriteSlice.ts) slices that single image into N individual icon
// PNGs client-side. One gpt-image-2.5-sunburst call regardless of how many
// icons come back — much cheaper and faster than N separate generations.
//
// Body: { prompt: string, count: 6 | 8, reference_image?: string }
//   reference_image (optional) — a style reference (e.g. the approved banner
//   or a manually uploaded image): when present we call the i2i
//   /v1/images/edits endpoint so the icon set echoes its palette/art style
//   instead of being invented from the text prompt alone.
// Response: { imageUrl (data:image/png;base64,…), cols, rows, count, costUsd }
import { optionalUser } from "@/lib/auth-server";
import { recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
// gpt-image can take ~20–30s per image; a grid is denser than a single
// character, keep the function alive long enough.
export const maxDuration = 300;

// Same engine as the character/banner generators — top quality, token-billed,
// supports i2i edits for the reference path.
const SYMBOLS_IMAGE_MODEL = "gpt-image-2.5-sunburst";

// Always a 2-row grid: 6 → 3×2, 8 → 4×2. Fixed landscape canvas so both
// layouts land on cells close to square (3×2 → perfectly square cells;
// 4×2 → mildly portrait cells, still fine for a padded icon).
const GRID_SIZE = "1536x1024";
const ROWS = 2;

type Body = { prompt?: string; count?: number; reference_image?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const count = body.count === 6 ? 6 : 8;
  const cols = count / ROWS;

  const prompt = (body.prompt || "").trim().slice(0, 4000);
  if (!prompt) return Response.json({ error: "Пустой промпт" }, { status: 400 });

  const reference = (body.reference_image || "").trim();
  const hasReference = reference.startsWith("data:");

  const referenceClause = hasReference
    ? "\n\nSTYLE REFERENCE: match the attached image's color palette and art style (flat / cartoon / " +
      "photoreal — whichever it is) for every icon, but invent NEW icon subjects that fit the THEME below — " +
      "do not copy the reference's subject or composition, only its visual style."
    : "";

  const full =
    `Generate exactly ${count} unique slot-machine symbol icons, one per cell, arranged in a precise ` +
    `${cols}-column × ${ROWS}-row grid that evenly divides the full canvas (each cell is the same fixed size). ` +
    `Center each icon inside its cell with generous padding on all sides so nothing touches the cell edges or ` +
    `bleeds into a neighbouring cell. Theme: ${prompt}. Every icon must be CLEARLY DIFFERENT from the others — ` +
    `distinct objects/symbols/characters fitting the theme, not colour variants of the same shape. Consistent ` +
    `single icon-art style across all of them (flat/cartoon, bold clean silhouette, vivid saturated colours, ` +
    `soft drop shadow), game-symbol quality suitable for a casino slot reel.${referenceClause}\n\n` +
    `OUTPUT: no grid lines, no cell borders, no numbering, no text or labels anywhere. FULLY TRANSPARENT ` +
    `background everywhere outside the icons themselves (including all the padding inside each cell) — no ` +
    `scene, no floor, no background colour, no vignette.`;

  let res: Response;
  try {
    if (hasReference) {
      // i2i via /v1/images/edits — the reference is a real input image, not
      // just prose. Fetch/decode it into a Blob for the multipart form.
      const refResp = await fetch(reference);
      const refBuf = Buffer.from(await refResp.arrayBuffer());
      const refType = reference.match(/^data:([^;]+);/)?.[1] || "image/png";

      const form = new FormData();
      form.append("model", SYMBOLS_IMAGE_MODEL);
      form.append("prompt", full);
      form.append("size", GRID_SIZE);
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
          model: SYMBOLS_IMAGE_MODEL,
          prompt: full,
          size: GRID_SIZE,
          quality: "medium",
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
      model: SYMBOLS_IMAGE_MODEL,
      feature: "landing-slot-symbols",
      type: "image",
      costUsd: 0,
    });
  }

  return Response.json({ imageUrl, cols, rows: ROWS, count, costUsd: 0 });
}
