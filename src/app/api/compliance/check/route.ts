// POST /api/compliance/check — проверка креатива перед модерацией: правила
// рекламных сетей и страны показа (lib/compliance/rules).
// Body: { image: data URL | https, networks: ComplianceNetworkId[], geo: ComplianceGeoId }
// Response: { results: [{id, ok, note}], text: string }
// Пункты собирает сервер по id сетей и страны — клиент не подсовывает свои.
// Модель смотрит на картинку и отвечает по каждому визуальному пункту. Бесплатно.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { COMPLIANCE_MODEL, runComplianceCheck } from "@/lib/compliance/check";
import { isGeoId, isNetworkId } from "@/lib/compliance/rules";
import { isClaude } from "@/lib/llm";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { safeFetchImage } from "@/lib/safe-fetch";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("compliance-check", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 14 * 1024 * 1024);
  if (big) return big;
  let body: { image?: string; networks?: unknown; geo?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const networks = (Array.isArray(body.networks) ? body.networks : []).filter(isNetworkId).slice(0, 5);
  const geo = isGeoId(body.geo) ? body.geo : "any";

  let image = String(body.image ?? "");
  if (/^https?:\/\//.test(image)) {
    try {
      const { buffer, mime } = await safeFetchImage(image);
      image = `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return Response.json({ error: "Не удалось загрузить креатив" }, { status: 400 });
    }
  }
  const bad = assertImageDataUrl("image", image);
  if (bad) return bad;
  if (!image.startsWith("data:image/")) return Response.json({ error: "image required" }, { status: 400 });

  const keyOk = isClaude(COMPLIANCE_MODEL) ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;
  if (!keyOk) return Response.json({ error: "Проверка не настроена" }, { status: 500 });
  try {
    const { results, text, llm } = await runComplianceCheck(image, [...new Set(networks)], geo);
    await recordUsage(user.id, { model: llm.model, feature: "compliance-check", type: "llm", ...extractUsage({ usage: llm.usage }, COMPLIANCE_MODEL) });
    return Response.json({ results, text });
  } catch {
    return Response.json({ error: "Проверка недоступна — попробуйте ещё раз" }, { status: 502 });
  }
}
