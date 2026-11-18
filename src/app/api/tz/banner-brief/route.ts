// POST /api/tz/banner-brief — описание одного баннера из задания движка ТЗ,
// сплавленное с выбранным шаблоном (арт-директор из bannerTz).
// Body: { job: TzJob, banner: TzBanner, template: {name, description, prompt} }
// Response: { prompt, bannerText, buttonText, ideas }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { enhanceBannerBrief, TZ_BRIEF_MODEL } from "@/lib/bannerTz";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("tz-banner-brief", user.id, 30, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 256 * 1024);
  if (big) return big;
  let body: { job?: Record<string, unknown>; banner?: Record<string, unknown>; template?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const job = body.job ?? {};
  const b = body.banner ?? {};
  const t = body.template ?? {};
  const style = (job.style ?? {}) as Record<string, unknown>;
  const brand = (job.brand ?? {}) as Record<string, unknown>;
  const images = Array.isArray(job.images) ? (job.images as Record<string, unknown>[]) : [];
  const palette = Array.isArray(style.palette) ? (style.palette as unknown[]).filter((x) => typeof x === "string").join(", ") : "";
  const legal = Array.isArray(job.legal) ? (job.legal as unknown[]).filter((x) => typeof x === "string").join(" / ") : "";
  // Арт-директору идёт уже понятое ТЗ, а не сырой текст: ему не надо гадать.
  const brief = [
    `Задача: ${str(job.summary, 600)}`,
    `Баннер: ${str(b.name, 80)}, формат ${str(b.aspect, 8)}.`,
    `Оффер (дословно): ${str(job.offer, 200) || "—"}`,
    `Заголовок на баннере: «${str(b.headline, 60)}»${str(b.sub, 80) ? `; вторая строка: «${str(b.sub, 80)}»` : ""}; кнопка: «${str(b.cta, 28)}».`,
    `Язык текстов: ${str(job.language, 8)}. Гео: ${str(job.geo, 80)}. Аудитория: ${str(job.audience, 160)}.`,
    `Бренд: ${str(brand.name, 60) || "—"}.`,
    `Визуал: ${str(b.visual, 900)}`,
    `Арт-дирекшн: ${str(style.direction, 600)}; настроение: ${str(style.mood, 120)}; палитра: ${palette}.`,
    images.length
      ? `Референсы из ТЗ: ${images
          .filter((i) => i.role !== "irrelevant")
          .map((i) => `${str(i.role, 20)}: ${str(i.note, 200)}`)
          .join("; ")}`
      : "",
    legal ? `Юр. строка: ${legal}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  const { result, usage } = await enhanceBannerBrief(
    brief,
    { name: str(t.name, 80), description: str(t.description, 300), prompt: str(t.prompt, 3000) },
    apiKey,
  ).catch(() => ({ result: null, usage: null }));
  if (usage)
    await recordUsage(user.id, { model: TZ_BRIEF_MODEL, feature: "tz-banner-brief", type: "llm", ...extractUsage(usage, TZ_BRIEF_MODEL) });
  if (!result) return Response.json({ error: "Не удалось подготовить описание баннера" }, { status: 502 });
  // Тексты из задания главнее придуманных арт-директором: они из ТЗ.
  return Response.json({
    ...result,
    bannerText: str(b.headline, 60) || result.bannerText,
    buttonText: str(b.cta, 28) || result.buttonText,
  });
}
