// POST /api/history/$cardId/resize-tile
// Body: { image: dataURL, width: number, height: number, aspect_ratio?: string, group_id?: string }
//
// Persists a single resize tile that was produced entirely client-side
// (either via the smartcrop fast-path on the master, or via a center-
// crop of an i2i bucket result). These tiles never went through
// /api/generate-image, so cardWriter.recordGenerationAndUpload didn't
// see them — they would otherwise vanish from the history card.
//
// Side effects:
//   1. INSERT generations row (is_master=false, card_id, w, h,
//      upload_status='pending'). No billing — the bucket gen was
//      already charged once.
//   2. Fire-and-forget FTP upload (same plumbing as generate-image).
//   3. touch_card_activity so /history sorts the card to the top.
//
// Ownership is enforced via the user-scoped client (RLS): the insert
// fails if the caller doesn't own the card. We re-check on the server
// before queuing the upload to keep the FTP layer from accepting
// orphan files.
import { randomUUID } from "node:crypto";

import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";
import { decodeDataUrl, uploadImage } from "@/lib/ftp/storage";
import { persistPendingBuffer } from "@/lib/history/uploadRetryWorker";
import { logAudit, logSystem } from "@/lib/logger";
import { rateLimitResponse, dataUrlByteLength, MAX_DATAURL_BYTES } from "@/lib/request-guard";

type Body = {
  image?: string;
  width?: number;
  height?: number;
  aspect_ratio?: string;
  group_id?: string;
};

export async function POST(request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const params = await ctx.params;
  try {
    const user = await requireUser(request);
    const cardId = String(params.cardId);

    const rtRl = rateLimitResponse("resize-tile", user.id, 120, 60_000);
    if (rtRl) return rtRl;

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const image = (body.image || "").trim();
    const width = Number(body.width) || 0;
    const height = Number(body.height) || 0;
    if (!image.startsWith("data:")) {
      return Response.json({ error: "image dataURL required" }, { status: 400 });
    }
    if (!width || !height || width < 16 || height < 16 || width > 8192 || height > 8192) {
      return Response.json({ error: "width/height required (16..8192)" }, { status: 400 });
    }
    // Defensive: reject empty / suspiciously small payloads. Tiles
    // smaller than 200 bytes of base64 cannot be a real JPEG/PNG
    // and would result in a 0-byte FTP file (one such file was
    // seen in the wild — likely a canvas.toDataURL that returned
    // just the data URI prefix). Bail before charging FTP for it.
    const commaIdx = image.indexOf(",");
    const payload = commaIdx >= 0 ? image.slice(commaIdx + 1) : "";
    if (payload.length < 200) {
      return Response.json({ error: "image payload empty or too small" }, { status: 400 });
    }
    if (dataUrlByteLength(image) > MAX_DATAURL_BYTES) {
      return Response.json({ error: "image too large" }, { status: 413 });
    }

    // RLS: the user-scoped client will refuse to read someone
    // else's card. We need this check so we don't waste an FTP
    // upload on a non-existent or unauthorized card.
    const userSupa = getUserClient(user.accessToken);
    const { data: card, error: cardErr } = await userSupa
      .from("generation_cards")
      .select("id")
      .eq("id", cardId)
      .maybeSingle();
    if (cardErr) {
      return Response.json({ error: cardErr.message }, { status: 500 });
    }
    if (!card) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }

    // Use the admin client for the insert so we can grab public_id
    // back via RETURNING regardless of RLS column whitelists. RLS
    // ownership was already validated above.
    const supa = getAdminClient();
    const publicId = randomUUID();
    const { data: gen, error: genErr } = await supa
      .from("generations")
      .insert({
        user_id: user.id,
        model: "client-crop",
        quality: "low",
        tokens_input_text: 0,
        tokens_input_image: 0,
        tokens_output: 0,
        total_tokens: 0,
        cost_usd: 0,
        cost_credits: 0,
        card_id: cardId,
        is_master: false,
        public_id: publicId,
        width,
        height,
        upload_status: "pending",
        meta: {
          kind: "client_resize",
          aspect_ratio: body.aspect_ratio ?? null,
          group_id: body.group_id ?? null,
        },
      })
      .select("id, public_id")
      .single();
    if (genErr || !gen) {
      void logSystem({
        level: "error",
        category: "history",
        message: "resize-tile insert failed",
        user_id: user.id,
        context: { card_id: cardId, width, height },
        error: genErr,
      });
      return Response.json({ error: genErr?.message || "insert failed" }, { status: 500 });
    }

    void logAudit({
      user_id: user.id,
      action: "generation.resize_added",
      resource_type: "generation",
      resource_id: gen.id,
      details: {
        card_id: cardId,
        source: "client_resize",
        width,
        height,
        group_id: body.group_id ?? null,
        aspect_ratio: body.aspect_ratio ?? null,
      },
    });

    // Touch card activity so this tile pulls the card up in /history.
    try {
      await supa.rpc("touch_card_activity", { p_card_id: cardId });
    } catch (e) {
      void logSystem({
        level: "warn",
        category: "history",
        message: "touch_card_activity rpc failed (resize-tile)",
        user_id: user.id,
        context: { card_id: cardId },
        error: e,
      });
    }

    // Detached FTP upload. Mirrors cardWriter.uploadInBackground —
    // on failure we persist the buffer to disk and let the retry
    // worker take over.
    void uploadTile({
      generationId: gen.id,
      publicId: gen.public_id as string,
      userId: user.id,
      image,
      width,
      height,
    });

    return Response.json({ generation_id: gen.id });
  } catch (err) {
    return authErrorResponse(err);
  }
}

/**
 * Detached upload — same shape as the master/i2i path. Errors don't
 * propagate because the user already has the tile on their screen.
 */
async function uploadTile(args: {
  generationId: string;
  publicId: string;
  userId: string;
  image: string;
  width: number;
  height: number;
}): Promise<void> {
  const { generationId, publicId, userId, image, width, height } = args;
  const supa = getAdminClient();
  let buffer: Buffer;
  let format: "png" | "jpg";
  try {
    const dec = decodeDataUrl(image);
    buffer = dec.buffer;
    format = dec.format;
  } catch (e) {
    void logSystem({
      level: "error",
      category: "ftp",
      message: "resize-tile decode failed",
      user_id: userId,
      context: { generation_id: generationId },
      error: e,
    });
    await supa
      .from("generations")
      .update({
        upload_status: "failed",
        last_error: "decode failed",
      })
      .eq("id", generationId);
    return;
  }
  if (buffer.byteLength < 100) {
    // Double-check post-decode: a base64 string can be long but still
    // contain only padding/whitespace. Don't waste an FTP write.
    void logSystem({
      level: "error",
      category: "ftp",
      message: "resize-tile decoded buffer too small",
      user_id: userId,
      context: { generation_id: generationId, bytes: buffer.byteLength },
    });
    await supa
      .from("generations")
      .update({
        upload_status: "failed",
        last_error: `decoded buffer only ${buffer.byteLength} bytes`,
      })
      .eq("id", generationId);
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await uploadImage(buffer, {
      userId,
      publicId,
      kind: "resize",
      format,
      width,
      height,
    });
    await supa
      .from("generations")
      .update({
        image_url: result.url,
        ftp_path: result.ftpPath,
        filename: result.filename,
        upload_status: "success",
      })
      .eq("id", generationId);
    void logSystem({
      level: "info",
      category: "ftp",
      message: "resize-tile upload succeeded (first try)",
      user_id: userId,
      duration_ms: Date.now() - startedAt,
      context: {
        generation_id: generationId,
        public_id: publicId,
        format,
        bytes: buffer.byteLength,
        width,
        height,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void logSystem({
      level: "warn",
      category: "ftp",
      message: "resize-tile first FTP attempt failed — queued for retry",
      user_id: userId,
      duration_ms: Date.now() - startedAt,
      context: {
        generation_id: generationId,
        error_message: msg.slice(0, 200),
        width,
        height,
      },
      error: err,
    });
    try {
      await persistPendingBuffer(generationId, buffer, format);
    } catch (e) {
      void logSystem({
        level: "error",
        category: "ftp",
        message: "resize-tile persistPendingBuffer failed",
        user_id: userId,
        context: { generation_id: generationId },
        error: e,
      });
    }
    try {
      await supa
        .from("generations")
        .update({
          upload_status: "pending",
          upload_attempts: 1,
          next_retry_at: new Date(Date.now() + 30_000).toISOString(),
          last_error: msg.slice(0, 500),
        })
        .eq("id", generationId);
    } catch {
      // already logged the original failure; swallow secondary error
    }
  }
}
