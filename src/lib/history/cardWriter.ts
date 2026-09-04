/**
 * Card + generation row writer for the history feature.
 *
 * Bridges generate-image.ts with the FTP storage layer:
 *   1. Strips base64 dataURLs from the request body for form_snapshot
 *   2. Builds a fast template-name for the card (AI-naming polish in Task #5)
 *   3. Creates generation_cards row for masters, touches activity for resizes
 *   4. Inserts the generations row with FTP fields
 *   5. Fires the FTP upload asynchronously (fire-and-forget) and patches
 *      upload_status when done — the user gets the image immediately
 *      regardless of upload state.
 *
 * Server-only: uses the admin (service-role) Supabase client. Never import
 * from browser code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { runBackground } from "../background";
import { notify } from "../notifications";
import { decodeDataUrl, uploadImage } from "../ftp/storage";
import { resolveCanvasSize } from "../imageSizes";
import { logAudit, logSystem } from "../logger";
import { polishCardName } from "./aiNaming";
import { persistPendingBuffer } from "./uploadRetryWorker";

// Keys whose values are base64 dataURLs (or could become huge). Stripped
// from form_snapshot to keep the jsonb column lean and the search index fast.
const DATA_URL_KEYS = new Set([
  "source_image",
  "brand_logo",
  "slot_screenshot",
  "slot_logo",
  "side_a_logo",
  "side_b_logo",
  "master_details", // structured but irrelevant to re-use; kept out of snapshot
]);

/**
 * Returns a sanitized shallow copy of the request body suitable for storing
 * in generation_cards.form_snapshot. Drops dataURL fields, drops any value
 * larger than 4 KB, drops nullish/empty strings.
 */
export function buildFormSnapshot(body: Record<string, unknown>): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    if (DATA_URL_KEYS.has(k)) continue;
    if (typeof v === "string") {
      if (!v) continue;
      if (v.startsWith("data:")) continue;
      if (v.length > 4000) continue;
      snap[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      snap[k] = v;
    } else {
      // For objects/arrays — keep only if the JSON encoding is small
      try {
        const enc = JSON.stringify(v);
        if (enc.length <= 4000) snap[k] = v;
      } catch {
        // ignore non-serializable
      }
    }
  }
  return snap;
}

const PRESET_LABELS: Record<string, string> = {
  preset1: "Широкий угол",
  preset2: "Слот",
  preset3: "Событие",
  preset4: "Спорт",
};

function presetLabel(presetId: string | undefined): string {
  if (!presetId) return "Баннер";
  return PRESET_LABELS[presetId] || presetId;
}

function dateLabel(now = new Date()): string {
  const months = [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ];
  return `${now.getUTCDate()} ${months[now.getUTCMonth()]}`;
}

/**
 * Template card name applied at create-time. Task #5 (AI-naming) will
 * overwrite this asynchronously with a gpt-4o-mini-polished version.
 *
 * Format: `{preset} · {first_meaningful_text} · {day month}`
 *   "Спорт · Лига Чемпионов · 1 июн"
 */
export function buildTemplateName(body: Record<string, unknown>): string {
  const preset = presetLabel(body.preset_id as string | undefined);
  const candidates = [
    "banner_text",
    "subject",
    "subheadline_text",
    "event_text",
    "event_name",
    "slot_name",
    "bonus_text",
  ];
  let hint = "";
  for (const k of candidates) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) {
      hint = v.trim().slice(0, 60);
      break;
    }
  }
  const tail = dateLabel();
  return hint ? `${preset} · ${hint} · ${tail}` : `${preset} · ${tail}`;
}

/**
 * Resolve the width/height we record on the generations row. Uses the
 * shared imageSizes module so the DB record matches the canvas size we
 * actually asked OpenAI to draw on — otherwise zip filenames and grid
 * aspect previews would lie about the file. Same call signature for
 * both master (no target dims) and resize bucket gens (target dims set
 * to the bucket primary tile).
 */
function resolveSize(
  aspect: string | undefined,
  targetW: number | undefined,
  targetH: number | undefined,
): { width: number; height: number } {
  const { w, h } = resolveCanvasSize(aspect, targetW, targetH);
  return { width: w, height: h };
}

export interface RecordGenerationArgs {
  supa: SupabaseClient;
  userId: string;
  body: Record<string, unknown>;
  image: string; // dataURL returned by provider
  isMaster: boolean;
  usage: Record<string, unknown>;
  totalTokens: number;
  costUsd: number;
  costCredits: number;
  coefficient: number;
  modelKey: string;
  quality: "low" | "medium" | "high";
  billingError: string | null;
  finalPrompt: string;
}

export interface RecordGenerationResult {
  cardId: string | null;
  generationId: string | null;
  uploadKickedOff: boolean;
}

/**
 * Creates/touches the card, writes the generations row, and fires the
 * background FTP upload. Returns immediately after the row is written —
 * the upload runs detached so the user-facing response stays fast.
 *
 * Errors here NEVER throw to the caller: a failed history write must not
 * block the user from seeing their already-paid-for image.
 */
export async function recordGenerationAndUpload(
  args: RecordGenerationArgs,
): Promise<RecordGenerationResult> {
  const {
    supa,
    userId,
    body,
    image,
    isMaster,
    usage,
    totalTokens,
    costUsd,
    costCredits,
    coefficient,
    modelKey,
    quality,
    billingError,
  } = args;
  const usageObj = (usage as Record<string, unknown>) || {};

  let cardId: string | null = null;
  try {
    if (isMaster) {
      const snapshot = buildFormSnapshot(body);
      const name = buildTemplateName(body);
      const presetId = (body.preset_id as string | undefined) || "";
      const { data: card, error: cardErr } = await supa
        .from("generation_cards")
        .insert({
          user_id: userId,
          name,
          preset_id: presetId,
          form_snapshot: snapshot,
        })
        .select("id")
        .single();
      if (cardErr) {
        void logSystem({
          supa,
          level: "error",
          category: "history",
          message: "generation_cards insert failed",
          context: { user_id: userId, preset_id: presetId },
          user_id: userId,
          error: cardErr,
        });
      } else {
        cardId = card?.id ?? null;
        if (cardId) {
          // Capture the narrowed (non-null) id so the deferred closures below
          // keep `string` instead of widening back to `string | null`.
          const newCardId = cardId;
          void logAudit({
            supa,
            user_id: userId,
            action: "card.created",
            resource_type: "card",
            resource_id: cardId,
            details: {
              preset_id: presetId,
              model: modelKey,
              quality,
              template_name: name,
            },
          });
          // Notify the user their creative is ready (best-effort, fire-and-forget).
          void notify(userId, {
            type: "creative_ready",
            title: "Креатив готов",
            body: `«${name}» сгенерирован и сохранён в историю.`,
            meta: { card_id: newCardId, preset_id: presetId, href: `/history/${newCardId}` },
          });
          // Fire-and-forget AI naming polish. User keeps the template name
          // if the LLM call or billing fails. runBackground keeps it alive
          // past the response on serverless.
          runBackground(() =>
            polishCardName({
              supa,
              userId,
              cardId: newCardId,
              body,
              templateName: name,
            }),
          );
        }
      }
    } else {
      const incoming = (body.card_id as string | undefined) || null;
      if (incoming) {
        // SEC-M2: the admin (service-role) client bypasses RLS, so verify the
        // card belongs to this user BEFORE attaching a generation to it or
        // bumping its activity. Otherwise a user could inject gens into /
        // extend retention on someone else's card via a forged card_id.
        const { data: ownRow, error: ownErr } = await supa
          .from("generation_cards")
          .select("id")
          .eq("id", incoming)
          .eq("user_id", userId)
          .maybeSingle();
        if (ownErr) {
          void logSystem({
            supa,
            level: "error",
            category: "history",
            message: "resize card ownership check failed",
            user_id: userId,
            context: { card_id: incoming },
            error: ownErr,
          });
        } else if (!ownRow) {
          // Not the caller's card → refuse attachment. The generation is
          // still recorded (under the caller) but stays unattached + un-uploaded.
          void logSystem({
            supa,
            level: "warn",
            category: "history",
            message: "resize card_id not owned by caller — attachment refused",
            user_id: userId,
            context: { card_id: incoming },
          });
        } else {
          cardId = incoming;
          try {
            await supa.rpc("touch_card_activity", { p_card_id: incoming });
          } catch (e) {
            void logSystem({
              supa,
              level: "warn",
              category: "history",
              message: "touch_card_activity rpc failed",
              user_id: userId,
              context: { card_id: incoming },
              error: e,
            });
          }
        }
      }
    }
  } catch (e) {
    void logSystem({
      supa,
      level: "error",
      category: "history",
      message: "card upsert unexpected",
      user_id: userId,
      error: e,
    });
  }

  const { width, height } = resolveSize(
    body.aspect_ratio as string | undefined,
    body.target_w as number | undefined,
    body.target_h as number | undefined,
  );

  let generationId: string | null = null;
  try {
    const { data: gen, error: genErr } = await supa
      .from("generations")
      .insert({
        user_id: userId,
        model: modelKey,
        quality,
        tokens_input_text: Number(usageObj.input_text_tokens) || 0,
        tokens_input_image: Number(usageObj.input_image_tokens) || 0,
        tokens_output: Number(usageObj.output_image_tokens) || 0,
        total_tokens: totalTokens,
        cost_usd: costUsd,
        cost_credits: costCredits,
        card_id: cardId,
        is_master: isMaster,
        width,
        height,
        upload_status: cardId ? "pending" : "legacy",
        meta: {
          coefficient,
          preset_id: (body.preset_id as string) || null,
          aspect_ratio: (body.aspect_ratio as string) || null,
          billing_error: billingError,
          provider: usageObj.provider ?? null,
          group_id: (body.group_id as string) || null,
        },
      })
      .select("id, public_id")
      .single();
    if (genErr) {
      void logSystem({
        supa,
        level: "error",
        category: "history",
        message: "generations insert failed",
        user_id: userId,
        context: { card_id: cardId, is_master: isMaster, model: modelKey },
        error: genErr,
      });
    } else {
      generationId = gen?.id ?? null;
      // Audit row for every gen attached to a card — useful when
      // investigating "where did my credits go".
      if (cardId && generationId) {
        void logAudit({
          supa,
          user_id: userId,
          action: isMaster ? "generation.master_created" : "generation.resize_added",
          resource_type: "generation",
          resource_id: generationId,
          details: {
            card_id: cardId,
            model: modelKey,
            quality,
            cost_credits: costCredits,
            total_tokens: totalTokens,
            width,
            height,
            group_id: (body.group_id as string) || null,
            aspect_ratio: (body.aspect_ratio as string) || null,
          },
        });
      }
      // Fire-and-forget upload only if we have a card to attach to. Legacy
      // rows (no card) skip FTP entirely.
      if (cardId && generationId && gen?.public_id) {
        // Capture narrowed values so the deferred closure keeps `string`.
        const genId = generationId;
        const publicId = gen.public_id as string;
        runBackground(() =>
          uploadInBackground({
            supa,
            generationId: genId,
            publicId,
            userId,
            isMaster,
            image,
            width,
            height,
          }),
        );
      }
    }
  } catch (e) {
    void logSystem({
      supa,
      level: "error",
      category: "history",
      message: "generations insert unexpected",
      user_id: userId,
      error: e,
    });
  }

  return { cardId, generationId, uploadKickedOff: !!(cardId && generationId) };
}

interface UploadInBackgroundArgs {
  supa: SupabaseClient;
  generationId: string;
  publicId: string;
  userId: string;
  isMaster: boolean;
  image: string;
  width: number;
  height: number;
}

/**
 * Detached upload routine. Decodes the dataURL, pushes to FTP, then patches
 * the generations row with the public URL (or marks failure for the
 * crash-recovery cron — see Task #8).
 */
async function uploadInBackground(args: UploadInBackgroundArgs): Promise<void> {
  const { supa, generationId, publicId, userId, isMaster, image, width, height } = args;
  // Decode once up-front so we have the buffer available for both the
  // immediate attempt and the disk-persist fallback on failure.
  let buffer: Buffer;
  let format: "png" | "jpg";
  try {
    const decoded = decodeDataUrl(image);
    buffer = decoded.buffer;
    format = decoded.format;
  } catch (e) {
    void logSystem({
      supa,
      level: "error",
      category: "ftp",
      message: "decodeDataUrl failed — cannot upload",
      user_id: userId,
      context: { generation_id: generationId },
      error: e,
    });
    await markUploadFailed(supa, generationId, "Не удалось декодировать изображение");
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await uploadImage(buffer, {
      userId,
      publicId,
      kind: isMaster ? "master" : "resize",
      format,
      width: isMaster ? undefined : width,
      height: isMaster ? undefined : height,
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
      supa,
      level: "info",
      category: "ftp",
      message: "upload succeeded (first try)",
      user_id: userId,
      duration_ms: Date.now() - startedAt,
      context: {
        generation_id: generationId,
        public_id: publicId,
        is_master: isMaster,
        format,
        bytes: buffer.byteLength,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    void logSystem({
      supa,
      level: "warn",
      category: "ftp",
      message: "first FTP attempt failed — queued for retry worker",
      user_id: userId,
      duration_ms: Date.now() - startedAt,
      context: {
        generation_id: generationId,
        public_id: publicId,
        is_master: isMaster,
        format,
        bytes: buffer.byteLength,
        error_message: msg.slice(0, 200),
      },
      error: err,
    });

    // Persist the bytes so the retry worker can recover them after a
    // server restart. If even disk write fails (e.g. read-only FS),
    // we still mark pending — the worker will give up gracefully when
    // it can't find a buffer.
    try {
      await persistPendingBuffer(generationId, buffer, format);
    } catch (e) {
      void logSystem({
        supa,
        level: "error",
        category: "ftp",
        message: "persistPendingBuffer failed — retry worker will give up",
        user_id: userId,
        context: { generation_id: generationId },
        error: e,
      });
    }

    // First failure: bump attempts to 1, retry in 30s. Subsequent
    // retries are owned by uploadRetryWorker.tick.
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
    } catch (e) {
      void logSystem({
        supa,
        level: "error",
        category: "ftp",
        message: "failed to mark upload pending",
        user_id: userId,
        context: { generation_id: generationId },
        error: e,
      });
    }
  }
}

async function markUploadFailed(
  supa: SupabaseClient,
  generationId: string,
  reason: string,
): Promise<void> {
  try {
    await supa
      .from("generations")
      .update({
        upload_status: "failed",
        last_error: reason.slice(0, 500),
        next_retry_at: null,
      })
      .eq("id", generationId);
  } catch (e) {
    console.error("markUploadFailed failed", e);
  }
}
