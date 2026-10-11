// POST /api/email-assets — разместить картинки письма на хостинге.
//
// Письмо собирается в браузере, и пока картинки в нём — base64, Gmail и
// Outlook их просто не показывают. При выгрузке письма браузер присылает сюда
// картинки, получает обратно публичные ссылки и вставляет в HTML их.
//
// Тело: { images: { [ключ]: dataUrl } } — не больше шести картинок.
// Ответ: { urls: { [ключ]: url } }.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { decodeDataUrl, uploadEmailAsset } from "@/lib/ftp/storage";

// basic-ftp открывает сырые сокеты — только Node.js.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Шапка, лого, два значка магазинов — с запасом. */
const MAX_IMAGES = 6;
const KEY = /^[a-z][a-zA-Z0-9]{0,31}$/;

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("email-assets", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 15 * 1024 * 1024);
  if (big) return big;

  let images: Record<string, unknown>;
  try {
    const body = (await request.json()) as { images?: unknown };
    if (!body.images || typeof body.images !== "object" || Array.isArray(body.images)) {
      return Response.json({ error: "images is required" }, { status: 400 });
    }
    images = body.images as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entries = Object.entries(images);
  if (entries.length === 0 || entries.length > MAX_IMAGES) {
    return Response.json({ error: `От 1 до ${MAX_IMAGES} картинок` }, { status: 400 });
  }
  for (const [key, value] of entries) {
    if (!KEY.test(key) || typeof value !== "string" || !value.startsWith("data:image/")) {
      return Response.json({ error: `Некорректная картинка: ${key}` }, { status: 400 });
    }
    // Размер и магические байты: расширению и MIME от клиента не верим.
    const bad = assertImageDataUrl(key, value);
    if (bad) return bad;
  }

  try {
    const urls: Record<string, string> = {};
    for (const [key, value] of entries) {
      const { buffer, format } = decodeDataUrl(value as string);
      urls[key] = (await uploadEmailAsset(buffer, format)).url;
    }
    return Response.json({ urls });
  } catch (e) {
    console.error("email-assets: upload failed", e);
    return Response.json({ error: "Не удалось разместить картинки" }, { status: 502 });
  }
}
