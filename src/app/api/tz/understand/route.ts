// POST /api/tz/understand — движок ТЗ: собрать всё из ТЗ и понять задачу.
//
// Body: { product?: TzProduct (по умолчанию banner), text?, files?: [{name, base64}],
//         images?: string[] (data URL), templates?: [{id, name, description}], stream?: boolean }
// Каталог шаблонов шлёт клиент (он живёт в клиентском модуле), сервер выбирает из него.
// Response (stream=false): { job: TzJob, images, links, sources }
// Response (stream=true): NDJSON — строки {type:"event", message} по ходу разбора
//   («Открыл olymp-csn.com — «Olymp»»), затем {type:"result", …} или {type:"error", error}.
// Кредиты не списываются (текстовый запрос); лимит — на пользователя.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { ingestTz } from "@/lib/tz/ingest";
import { TZ_PLANS, TZ_PRODUCTS, type TzProduct } from "@/lib/tz/plans";
import { TZ_MODEL, understandTz, type TemplateInfo, type TzJob } from "@/lib/tz/understand";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Что модель поняла — пара строк в ход разбора, пока клиент ещё не нарисовал карточку. */
function highlights(job: TzJob): string[] {
  const out: string[] = [];
  if (job.offer) out.push(`Оффер: ${job.offer}`);
  out.push(`Язык: ${job.language}${job.geo ? ` · ${job.geo}` : ""}`);
  if (job.brand.name) out.push(`Бренд: ${job.brand.name}`);
  if (job.questions.length) out.push(`Есть вопросы по ТЗ: ${job.questions.length}`);
  return out;
}

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
  let body: { product?: unknown; text?: unknown; files?: unknown; images?: unknown; templates?: unknown; stream?: unknown };
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

  const run = async (onEvent: (m: string) => void) => {
    onEvent(files.length || images.length ? "Читаю ТЗ, файлы и картинки" : "Читаю ТЗ");
    const bundle = await ingestTz({ text, files, images }, onEvent);
    if (!bundle.text && !bundle.images.length) throw Object.assign(new Error("Не удалось ничего прочитать из ТЗ"), { status: 422 });
    onEvent(bundle.images.length ? `Смотрю референсы (${bundle.images.length}) и понимаю задачу` : "Понимаю задачу");
    const { job, usage } = await understandTz(bundle, templates, apiKey, product);
    await recordUsage(user.id, { model: TZ_MODEL, feature: `tz-understand:${product}`, type: "llm", ...extractUsage(usage, TZ_MODEL) });
    highlights(job).forEach(onEvent);
    return { job, images: bundle.images, links: bundle.links, sources: bundle.sources };
  };

  if (body.stream !== true) {
    try {
      return Response.json(await run(() => {}));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 422) return Response.json({ error: (e as Error).message }, { status: 422 });
      console.error("[tz/understand]", e);
      return Response.json({ error: "Не удалось разобрать ТЗ, попробуйте ещё раз" }, { status: 502 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const result = await run((message) => send({ type: "event", message }));
        send({ type: "result", ...result });
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status !== 422) console.error("[tz/understand]", e);
        send({ type: "error", error: status === 422 ? (e as Error).message : "Не удалось разобрать ТЗ, попробуйте ещё раз" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
