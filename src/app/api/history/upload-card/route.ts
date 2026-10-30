// POST /api/history/upload-card
// Body: { image: dataURL, name?: string, width: number, height: number }
//
// Свой баннер (GIF-генератор, «Загрузить свой баннер») — карточкой в Истории:
// картинка становится мастером карточки. Тогда слои GIF (персонаж, фон, надписи)
// сохраняются в неё (/api/history/[cardId]/layers) и повторная сборка бесплатна —
// и после перезагрузки, и на другом устройстве.
//
// Сначала FTP, потом записи: не залилось — карточку не создаём (без пустых в Истории).
import { randomUUID } from "node:crypto";

import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";
import { decodeDataUrl, uploadImage } from "@/lib/ftp/storage";
import { logAudit, logSystem } from "@/lib/logger";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";

export const runtime = "nodejs";

type Body = { image?: string; name?: string; width?: number; height?: number };

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const rl = await rateLimitResponse("upload-card", user.id, 20, 60_000);
    if (rl) return rl;
    const big = rejectLargeBody(request, 20 * 1024 * 1024);
    if (big) return big;
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const image = (body.image || "").trim();
    const width = Math.round(Number(body.width) || 0);
    const height = Math.round(Number(body.height) || 0);
    if (!image.startsWith("data:"))
      return Response.json({ error: "image dataURL required" }, { status: 400 });
    if (width < 16 || height < 16 || width > 8192 || height > 8192)
      return Response.json({ error: "width/height required (16..8192)" }, { status: 400 });
    const bad = assertImageDataUrl("image", image);
    if (bad) return bad;
    const name =
      (body.name || "Свой баннер")
        .replace(/\.(png|jpe?g|webp)$/i, "")
        .trim()
        .slice(0, 120) || "Свой баннер";

    const { buffer, format } = decodeDataUrl(image);
    if (buffer.byteLength < 100)
      return Response.json({ error: "image payload empty" }, { status: 400 });
    const publicId = randomUUID();
    let up: { url: string; ftpPath: string; filename: string };
    try {
      up = await uploadImage(buffer, {
        userId: user.id,
        publicId,
        kind: "master",
        format,
        width,
        height,
      });
    } catch (e) {
      void logSystem({
        level: "error",
        category: "ftp",
        message: "upload-card FTP failed",
        user_id: user.id,
        error: e,
      });
      return Response.json({ error: "Не удалось сохранить картинку" }, { status: 502 });
    }

    const supa = getAdminClient();
    const { data: card, error: cardErr } = await supa
      .from("generation_cards")
      .insert({ user_id: user.id, name, preset_id: "", form_snapshot: { source: "upload" } })
      .select("id")
      .single();
    if (cardErr || !card)
      return Response.json({ error: cardErr?.message || "card insert failed" }, { status: 500 });
    const { error: genErr } = await supa.from("generations").insert({
      user_id: user.id,
      model: "upload",
      quality: "low",
      tokens_input_text: 0,
      tokens_input_image: 0,
      tokens_output: 0,
      total_tokens: 0,
      cost_usd: 0,
      cost_credits: 0,
      card_id: card.id,
      is_master: true,
      public_id: publicId,
      width,
      height,
      image_url: up.url,
      ftp_path: up.ftpPath,
      filename: up.filename,
      upload_status: "success",
      meta: { kind: "user_upload" },
    });
    if (genErr) {
      await supa.from("generation_cards").delete().eq("id", card.id);
      return Response.json({ error: genErr.message }, { status: 500 });
    }
    void logAudit({
      user_id: user.id,
      action: "card.uploaded",
      resource_type: "generation_card",
      resource_id: card.id,
      details: { width, height },
    });
    return Response.json({ card_id: card.id, image_url: up.url, name });
  } catch (err) {
    return authErrorResponse(err);
  }
}
