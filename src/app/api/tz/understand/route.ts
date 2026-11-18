// POST /api/tz/understand — движок ТЗ: собрать всё из ТЗ и понять задачу.
//
// Body: { product?: TzProduct (по умолчанию banner), text?, files?: [{name, base64}],
//         images?: string[] (data URL), templates?: [{id, name, description}] }  — каталог шаблонов шлёт клиент
//         (он живёт в клиентском модуле), сервер выбирает из него.
// Response: { job: TzJob, images: TzImage[], links: TzLinkInfo[], sources: TzSource[] }
// Кредиты не списываются (текстовый запрос); лимит — на пользователя.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { ingestTz } from "@/lib/tz/ingest";
import { TZ_MODEL, understandTz, type TemplateInfo } from "@/lib/tz/understand";
import { TZ_PLANS, TZ_PRODUCTS, type TzProduct } from "@/lib/tz/plans";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("tz-understand", user.id, 8, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 40 * 1024 * 1024);
  if (big) return big;
  let body: { product?: unknown; text?: unknown; files?: unknown; images?: unknown; templates?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, 100_000) : "";
  const files = (Array.isArray(body.files) ? body.files : [])
    .filter(
      (f): f is { name: string; base64: string } =>
        !!f && typeof f === "object" && typeof (f as { base64?: unknown }).base64 === "string",
    )
    .slice(0, 4)
    .filter((f) => f.base64.length < 14 * 1024 * 1024);
  const images = (Array.isArray(body.images) ? body.images : []).filter((x): x is string => typeof x === "string").slice(0, 8);
  const templates: TemplateInfo[] = (Array.isArray(body.templates) ? body.templates : [])
    .map((t) => t as Record<string, unknown>)
    .filter((t) => typeof t?.id === "string" && typeof t?.name === "string")
    .map((t) => ({
      id: String(t.id).slice(0, 40),
      name: String(t.name).slice(0, 80),
      description: String(t.description ?? "").slice(0, 200),
    }))
    .slice(0, 200);
  if (!text.trim() && !files.length && !images.length) return Response.json({ error: "Пустое ТЗ" }, { status: 400 });
  const product: TzProduct = TZ_PRODUCTS.includes(body.product as TzProduct) ? (body.product as TzProduct) : "banner";
  if (TZ_PLANS[product].banners && !templates.length) return Response.json({ error: "Нет каталога шаблонов" }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  try {
    const bundle = await ingestTz({ text, files, images });
    if (!bundle.text && !bundle.images.length)
      return Response.json({ error: "Не удалось ничего прочитать из ТЗ", sources: bundle.sources }, { status: 422 });
    const { job, usage } = await understandTz(bundle, templates, apiKey, product);
    await recordUsage(user.id, { model: TZ_MODEL, feature: `tz-understand:${product}`, type: "llm", ...extractUsage(usage, TZ_MODEL) });
    return Response.json({ job, images: bundle.images, links: bundle.links, sources: bundle.sources });
  } catch (e) {
    console.error("[tz/understand]", e);
    return Response.json({ error: "Не удалось разобрать ТЗ, попробуйте ещё раз" }, { status: 502 });
  }
}
