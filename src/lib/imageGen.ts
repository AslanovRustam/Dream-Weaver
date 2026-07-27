import { PRESETS } from "@/components/PresetSidebar";
import { apiFetch } from "@/lib/api-client";
import { refreshMe } from "@/components/AppHeader";
import { CONTENT_FILTER_PREFIX, describeProviderError } from "@/lib/generation-errors";

export type GeneratePayload = {
  preset_id: string;
  button_text: string;
  banner_text: string;
  prompt: string;
  model: string;
  aspect_ratio: string;
  ad_texts_enabled: boolean;
  person_enabled: boolean;
  person_gender: "female" | "male" | null;
  brand_name?: string;
  brand_logo?: string;
  language?: string;
  slot_name?: string;
  slot_screenshot?: string;
  slot_logo?: string;
  event_text?: string;
  subheadline_text?: string;
  banner_text_enabled?: boolean;
  button_text_enabled?: boolean;
  subheadline_enabled?: boolean;
  sport_type?: string;
  match_type?: string;
  side_a_name?: string;
  side_a_logo?: string;
  side_b_name?: string;
  side_b_logo?: string;
  event_name?: string;
  match_datetime?: string;
  location?: string;
  bonus_text?: string;
  bonus_enabled?: boolean;
  players_enabled?: boolean;
  side_a_players?: string;
  side_b_players?: string;
  quality?: "low" | "medium" | "high";
  // ---- Resize-batch fields (optional) -------------------------------
  // When source_image is set, the server takes the master and produces
  // a re-rendered banner adapted to aspect_ratio. target_w/target_h let
  // the model design with the final crop canvas in mind.
  source_image?: string;
  target_w?: number;
  target_h?: number;
  /** Structured visual extraction of the master from /api/extract-master.
   *  When present the server injects a MASTER VISUAL FACTS block into
   *  the prompt so the image model has explicit OCR'd texts and a
   *  named central object to reproduce. */
  master_details?: MasterDetails;
  /** Use-case group id from BANNER_SIZE_GROUPS (e.g. "stories" for 9:16
   *  social, "youtube" for 16:9, "pinterest" for 3:4 cards, ...). When
   *  present the backend looks up GROUP_TEMPLATES[group_id] and embeds
   *  the per-use-case layout template into the resize prompt. */
  group_id?: string;
  /** History card the new generation should attach to. For masters this
   *  is normally undefined → the server creates a fresh card. For
   *  resizes done from a history pick, threading the card_id keeps every
   *  new resize in the same history card. */
  card_id?: string;
  /** When true, the server still bills + records the generation row but
   *  does NOT attach it to a history card. Used by the resize batch
   *  runner: the bucket i2i call produces the SOURCE for several tiles,
   *  and the final cropped tiles are persisted separately via
   *  /api/history/$cardId/resize-tile. Without this flag the bucket
   *  call would upload an off-spec image to FTP and double-count in
   *  the history card. */
  skip_history_attach?: boolean;
};

export type BannerTextItem = { text: string; position: string };
export type MasterDetails = {
  central_object: string;
  central_object_texts: string[];
  person: string | null;
  scene: string;
  colors: string[];
  style: string;
  banner_texts: BannerTextItem[];
};

/**
 * Vision-LLM pre-pass: extract every readable text and the central
 * object from the master banner. Used once per batch before any i2i
 * call, so all tiles share the same anchored facts.
 */
export async function extractMasterDetails(masterDataUrl: string): Promise<MasterDetails | null> {
  try {
    const res = await apiFetch("/api/extract-master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_image: masterDataUrl }),
    });
    if (!res.ok) {
      console.warn("extractMasterDetails non-OK", res.status);
      return null;
    }
    const data = (await res.json().catch(() => null)) as { details?: MasterDetails } | null;
    return data?.details ?? null;
  } catch (e) {
    console.warn("extractMasterDetails failed — continuing without it", e);
    return null;
  }
}

export type UsageInfo = {
  provider: "openai" | "lovable";
  model: string;
  quality: "low" | "medium" | "high";
  input_text_tokens?: number;
  input_image_tokens?: number;
  output_image_tokens?: number;
  input_tokens?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cost_usd?: number | null;
  elapsed_ms?: number | null;
  note?: string;
};

export type GenerateResult = {
  image: string;
  usage: UsageInfo | null;
  /** Identifier of the history card this generation was written to. New
   *  master generations get a freshly-created card; resizes attach to
   *  the master's card. May be null if history persistence is disabled
   *  or temporarily down. */
  card_id?: string | null;
  generation_id?: string | null;
};

export async function generateImage(payload: GeneratePayload): Promise<GenerateResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  const startedAt = Date.now();
  try {
    const preset = PRESETS.find((p) => p.id === payload.preset_id);
    const subject = payload.prompt.trim();

    // apiFetch injects Authorization: Bearer <supabase access_token>.
    const res = await apiFetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preset_id: payload.preset_id,
        subject,
        template: preset?.template ?? null,
        banner_text: payload.banner_text || "",
        button_text: payload.button_text || "",
        aspect_ratio: payload.aspect_ratio,
        model: payload.model,
        ad_texts_enabled: payload.ad_texts_enabled,
        person_enabled: payload.person_enabled,
        person_gender: payload.person_gender,
        brand_name: payload.brand_name || "",
        brand_logo: payload.brand_logo || "",
        language: payload.language || "auto",
        slot_name: payload.slot_name || "",
        slot_screenshot: payload.slot_screenshot || "",
        slot_logo: payload.slot_logo || "",
        event_text: payload.event_text || "",
        subheadline_text: payload.subheadline_text || "",
        banner_text_enabled: !!payload.banner_text_enabled,
        button_text_enabled: !!payload.button_text_enabled,
        subheadline_enabled: !!payload.subheadline_enabled,
        sport_type: payload.sport_type || "",
        match_type: payload.match_type || "",
        side_a_name: payload.side_a_name || "",
        side_a_logo: payload.side_a_logo || "",
        side_b_name: payload.side_b_name || "",
        side_b_logo: payload.side_b_logo || "",
        event_name: payload.event_name || "",
        match_datetime: payload.match_datetime || "",
        location: payload.location || "",
        bonus_text: payload.bonus_text || "",
        bonus_enabled: !!payload.bonus_enabled,
        players_enabled: payload.players_enabled,
        side_a_players: payload.side_a_players || "",
        side_b_players: payload.side_b_players || "",
        quality: payload.quality || "medium",
        // Resize batch — only sent when present.
        source_image: payload.source_image,
        target_w: payload.target_w,
        target_h: payload.target_h,
        master_details: payload.master_details,
        group_id: payload.group_id,
        card_id: payload.card_id,
        skip_history_attach: payload.skip_history_attach,
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      image?: string;
      usage?: UsageInfo | null;
      error?: string;
      detail?: string;
      card_id?: string | null;
      generation_id?: string | null;
    };
    if (!res.ok || !data.image) {
      if (res.status === 401) {
        throw new Error("Сессия истекла. Войдите снова.");
      }
      if (res.status === 402) {
        throw new Error("Недостаточно кредитов. Обратитесь к администратору.");
      }
      if (res.status === 504) {
        // 504 covers both real timeouts and upstream-terminated
        // connections (ECONNRESET from OpenRouter). The server's detail
        // string already has a user-friendly message — surface it.
        const detail = (data as { detail?: string }).detail || "";
        if (detail) throw new Error(detail);
        const q = payload.quality || "medium";
        if (q === "high") {
          throw new Error(
            "Таймаут сервера: High часто не успевает за лимит (~60с). Попробуйте Medium или Low.",
          );
        }
        if (q === "medium") {
          throw new Error("Таймаут сервера. Попробуйте ещё раз или переключитесь на Low.");
        }
        throw new Error("Таймаут сервера. Попробуйте упростить референсы или повторите.");
      }
      if (res.status === 422) {
        const detail = (data as { detail?: string }).detail || "";
        // 422 from our server is always a provider content-policy block.
        throw new Error(CONTENT_FILTER_PREFIX + describeProviderError(detail, 422));
      }
      if (res.status === 400) {
        // OpenAI returns 400 (not 422) for safety_violations=[sexual] on
        // image edits. Detect by checking the detail string.
        const detail = (data as { detail?: string }).detail || "";
        const isSafetyBlock =
          detail.includes("safety_violations") ||
          detail.includes("safety system") ||
          detail.includes("rejected");
        if (isSafetyBlock) {
          throw new Error(CONTENT_FILTER_PREFIX + describeProviderError(detail, 400));
        }
        throw new Error(data.error ? String(data.error) : describeProviderError(detail, 400));
      }
      if (res.status === 502) {
        const errCode = String(data.error || "");
        const detail = (data as { detail?: string }).detail || errCode || "";
        // Safety violation: OpenAI returns 400 to the server, server wraps
        // it as 502. Detect by scanning the forwarded detail string.
        if (
          detail.includes("safety_violations") ||
          detail.includes("safety system") ||
          /rejected.*safety|safety.*rejected/i.test(detail)
        ) {
          throw new Error(CONTENT_FILTER_PREFIX + describeProviderError(detail, 502));
        }
        // No-image / generic provider errors get a clean message too.
        throw new Error(describeProviderError(detail, 502));
      }
      throw new Error(data.error ? String(data.error) : `HTTP ${res.status}`);
    }
    const elapsed = Date.now() - startedAt;
    const usage = data.usage ? { ...data.usage, elapsed_ms: elapsed } : null;
    // Successful generation just spent credits — refresh the header chip.
    refreshMe();
    return {
      image: data.image,
      usage,
      card_id: data.card_id ?? null,
      generation_id: data.generation_id ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Resize-batch helpers
// ---------------------------------------------------------------------------
// (resizeImage was here — replaced by passing source_image / target_w /
//  target_h directly through generateImage. One function path for both
//  initial creation and resize i2i adaptations.)

/**
 * Bring the model's native output to exact pixel dimensions.
 *
 * Three-tier strategy (mirrors the production Sharp pipeline from n8n):
 *   diff < 0.02  → plain scale (aspect already matches, just resize)
 *   diff < 0.50  → SMART CROP via smartcrop.js (attention — finds faces
 *                  / interesting regions and keeps them in frame)
 *   diff ≥ 0.50  → SMART CROP via smartcrop.js (entropy — maximises
 *                  retained detail when aspects differ a lot)
 *
 * smartcrop.js scores regions using edge density, saturation and skin
 * tone, then returns the rectangle that "would be missed least" if
 * we crop everything else away. Way better than a blind center-crop
 * when the model puts important content off-center.
 */
import smartcrop from "smartcrop";

type CropBoost = { x: number; y: number; width: number; height: number; weight: number };

export async function cropAndResize(
  imageDataUrl: string,
  targetW: number,
  targetH: number,
  mime: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
  /**
   * Optional list of regions to BIAS the crop toward (smartcrop will
   * try hard to keep them in frame). Coordinates are NORMALISED (0–1)
   * relative to the source image; we rescale to source pixels here.
   * Used by the per-use-case templates: when the model was told "put
   * everything inside the central 80% column for Stories", we boost
   * that same region so smartcrop preserves it.
   */
  boost?: CropBoost[],
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const targetAspect = targetW / targetH;
  const srcAspect = srcW / srcH;
  const diff = Math.abs(srcAspect - targetAspect);

  let cropX = 0;
  let cropY = 0;
  let cropW = srcW;
  let cropH = srcH;

  if (diff < 0.02) {
    // Aspect already matches — full image, plain scale. Equivalent to
    // Sharp's { fit: 'fill' }.
    cropW = srcW;
    cropH = srcH;
  } else {
    // Aspects differ — we need to crop. Ask smartcrop for the best
    // rectangle that contains as much of the "interesting" content as
    // possible while honouring the target aspect ratio.
    //
    // Weight tuning: we bump `edgeWeight` and `saturationWeight` above
    // their library defaults so dense text regions (which are full of
    // sharp edges and high-contrast strokes) survive the crop. This is
    // the cheap fix for "text near the edge got chopped off".
    const longSide = 256;
    const sample =
      targetAspect > 1
        ? { width: longSide, height: Math.max(1, Math.round(longSide / targetAspect)) }
        : { width: Math.max(1, Math.round(longSide * targetAspect)), height: longSide };

    try {
      // Convert normalised boost rects to source-pixel rects.
      const pixelBoost = (boost ?? []).map((b) => ({
        x: Math.round(b.x * srcW),
        y: Math.round(b.y * srcH),
        width: Math.round(b.width * srcW),
        height: Math.round(b.height * srcH),
        weight: b.weight,
      }));
      const result = await smartcrop.crop(
        img as unknown as HTMLImageElement,
        {
          ...sample,
          // Library defaults: edgeWeight ≈ 5, saturationWeight ≈ 0.3,
          // skinWeight ≈ 1.8. Bumping edge and saturation gives text and
          // brand-coloured CTAs a real chance against face scoring.
          edgeWeight: 8.0,
          saturationWeight: 1.0,
          skinWeight: 1.5,
          ...(pixelBoost.length > 0 ? { boost: pixelBoost } : {}),
        } as unknown as Parameters<typeof smartcrop.crop>[1],
      );
      // smartcrop's topCrop is given in SOURCE image coordinates.
      cropX = Math.max(0, Math.round(result.topCrop.x));
      cropY = Math.max(0, Math.round(result.topCrop.y));
      cropW = Math.min(srcW - cropX, Math.round(result.topCrop.width));
      cropH = Math.min(srcH - cropY, Math.round(result.topCrop.height));
    } catch (e) {
      // Safety fallback to plain center-crop if smartcrop blows up.
      console.warn("smartcrop failed, falling back to center crop", e);
      if (srcAspect > targetAspect) {
        cropH = srcH;
        cropW = Math.round(cropH * targetAspect);
        cropX = Math.round((srcW - cropW) / 2);
        cropY = 0;
      } else {
        cropW = srcW;
        cropH = Math.round(cropW / targetAspect);
        cropX = 0;
        cropY = Math.round((srcH - cropH) / 2);
      }
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d not supported");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
  return canvas.toDataURL(mime, quality);
}

/** Object-contain resize: scales the image to fit inside targetW×targetH
 *  while preserving aspect ratio. Fills the remaining space with black.
 *  Used as a last-resort fallback when the source and target aspect ratios
 *  differ (stretch would distort the image). */
export async function resizeContain(
  imageDataUrl: string,
  targetW: number,
  targetH: number,
  mime: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d not supported");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, targetW, targetH);
  const scale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (targetW - dw) / 2;
  const dy = (targetH - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return canvas.toDataURL(mime, quality);
}

/** Pure stretch-resize without cropping. Kept for callers that already
 *  know aspect ratios match and only need a pixel-density change. */
export async function resizeToExact(
  imageDataUrl: string,
  targetW: number,
  targetH: number,
  mime: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d not supported");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL(mime, quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for resize"));
    img.src = src;
  });
}

export async function downloadAsJpg(imageUrl: string, filename = "image.jpg") {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });
  img.src = imageUrl;
  await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
