// Слои баннера карточки — чтобы GIF из открытой в Истории карточки собирался без
// повторных генераций (src/lib/bannerLayersRun.ts).
//
// POST /api/history/$cardId/layers
//   Body: часть манифеста — { texts?, accent?, art?: {text, role, w, h, image}[],
//   hero?: {image, w, h}, bg?: {wide?|tall?: image}, plates?: {[form]: image} }.
//   Картинки (data:) уходят на FTP по хешу содержимого, в карточку
//   (form_snapshot.banner_layers) пишутся ссылки; поля сливаются с уже сохранёнными.
// GET /api/history/$cardId/layers
//   → { layers } с картинками data:-URL (канвасу нужен CORS, которого у FTP нет) —
//   одним запросом, а не десятком fetch-master.
import { authErrorResponse, getUserClient, requireUser } from "@/lib/auth-server";
import { getAdminClient } from "@/lib/supabase/admin";
import { decodeDataUrl, uploadLayerAsset } from "@/lib/ftp/storage";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { safeFetchImage } from "@/lib/safe-fetch";

export const runtime = "nodejs";
export const maxDuration = 120;

type Img = { url: string; w?: number; h?: number };
type ArtSaved = { text: string; role?: string; w: number; h: number; url: string };
export type SavedLayers = {
  texts?: { headline: string; offer: string; cta: string; sub?: string };
  accent?: string;
  art?: ArtSaved[];
  hero?: Img;
  bg?: Record<string, string>;
  plates?: Record<string, string>;
};

type PostBody = {
  texts?: SavedLayers["texts"];
  accent?: string;
  art?: { text: string; role?: string; w: number; h: number; image: string }[];
  hero?: { image: string; w: number; h: number };
  bg?: Record<string, string>;
  plates?: Record<string, string>;
};

const KEY_RE = /^[a-z]{3,12}$/;

async function ownCard(request: Request, cardId: string) {
  const user = await requireUser(request);
  const { data } = await getUserClient(user.accessToken)
    .from("generation_cards")
    .select("id, form_snapshot")
    .eq("id", cardId)
    .maybeSingle();
  return {
    user,
    card: data as { id: string; form_snapshot: Record<string, unknown> | null } | null,
  };
}

async function upload(image: string): Promise<string> {
  const bad = assertImageDataUrl("image", image);
  if (bad) throw new Error("bad image");
  const { buffer, format } = decodeDataUrl(image);
  return (await uploadLayerAsset(buffer, format)).url;
}

export async function POST(request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await ctx.params;
  try {
    const big = rejectLargeBody(request, 30 * 1024 * 1024);
    if (big) return big;
    const { user, card } = await ownCard(request, cardId);
    const rl = await rateLimitResponse("card-layers", user.id, 60, 60_000);
    if (rl) return rl;
    if (!card) return Response.json({ error: "Card not found" }, { status: 404 });
    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const snap = card.form_snapshot ?? {};
    const prev = (snap.banner_layers as SavedLayers | undefined) ?? {};
    const next: SavedLayers = { ...prev };
    if (body.texts && typeof body.texts.offer === "string") next.texts = body.texts;
    if (typeof body.accent === "string" && /^#[0-9a-f]{3,8}$/i.test(body.accent))
      next.accent = body.accent;
    // Загрузки на FTP — по одной: соединение FTP-клиента одно.
    if (Array.isArray(body.art)) {
      const art: ArtSaved[] = [];
      for (const p of body.art.slice(0, 16))
        art.push({
          text: String(p.text).slice(0, 40),
          role: p.role,
          w: Number(p.w) || 1,
          h: Number(p.h) || 1,
          url: await upload(p.image),
        });
      next.art = art;
    }
    if (body.hero?.image)
      next.hero = {
        url: await upload(body.hero.image),
        w: Number(body.hero.w) || 1,
        h: Number(body.hero.h) || 1,
      };
    for (const field of ["bg", "plates"] as const) {
      const part = body[field];
      if (!part) continue;
      const merged = { ...(prev[field] ?? {}) };
      for (const [k, v] of Object.entries(part))
        if (KEY_RE.test(k) && typeof v === "string") merged[k] = await upload(v);
      next[field] = merged;
    }
    // Владение проверено выше (RLS); пишем админ-клиентом — в RLS нет update form_snapshot.
    const { error } = await getAdminClient()
      .from("generation_cards")
      .update({ form_snapshot: { ...snap, banner_layers: next } })
      .eq("id", cardId)
      .eq("user_id", user.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await ctx.params;
  try {
    const { user, card } = await ownCard(request, cardId);
    const rl = await rateLimitResponse("card-layers-get", user.id, 30, 60_000);
    if (rl) return rl;
    if (!card) return Response.json({ error: "Card not found" }, { status: 404 });
    const saved = (card.form_snapshot?.banner_layers as SavedLayers | undefined) ?? null;
    if (!saved) return Response.json({ layers: null });
    // Картинка не скачалась (файл удалён) — этой части нет, клиент её сгенерирует.
    const data = async (url?: string) => {
      if (!url) return undefined;
      try {
        const { buffer, mime } = await safeFetchImage(url);
        return `data:${mime};base64,${buffer.toString("base64")}`;
      } catch {
        return undefined;
      }
    };
    const map = async (rec?: Record<string, string>) =>
      rec
        ? Object.fromEntries(
            (
              await Promise.all(
                Object.entries(rec).map(async ([k, u]) => [k, await data(u)] as const),
              )
            ).filter(([, v]) => v),
          )
        : undefined;
    const art = saved.art
      ? await Promise.all(saved.art.map(async (p) => ({ ...p, src: await data(p.url) })))
      : undefined;
    const heroSrc = await data(saved.hero?.url);
    return Response.json({
      layers: {
        texts: saved.texts,
        accent: saved.accent,
        // Лист — целиком или никак: без части слов строки рисовались бы шрифтом вразнобой.
        art: art && art.every((p) => p.src) ? art.map(({ url: _u, ...p }) => p) : undefined,
        hero:
          heroSrc && saved.hero ? { src: heroSrc, w: saved.hero.w, h: saved.hero.h } : undefined,
        bg: await map(saved.bg),
        plates: await map(saved.plates),
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
