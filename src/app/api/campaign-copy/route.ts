// POST /api/campaign-copy
//
// «Собрать кампанию», шаг 1 — раскладка темы (или ТЗ) по всем креативам одним
// запросом gpt-5.4-mini на языке кампании: заголовок, текст баннера, тексты
// плейбла (по полям выбранной сцены), письмо и блоки лендинга. Потом клиент
// генерирует графику для отмеченных частей. Кредиты не списываем — запрос
// текстовый; лимит частоты.
//
// Body: { topic, brief?: string (что поняли из ТЗ), kind, lang, brand, offer, cta,
//         parts: { landing, playable, email, banner }, scene: { id, fields: [{ key, label, value }] },
//         blocks: string[] }
// Response: { copy: CampaignCopy }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { euLang } from "@/lib/euLangs";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { extractUsage, recordUsage } from "@/lib/usage";
import { BLOCK_SHAPES, cleanBlockCopy, obj, s, arr, type Obj } from "@/lib/landingBlocksCopy";
import { humanizeOffer, OFFER_RULE } from "@/lib/offerText";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gpt-5.4-mini";

type SceneField = { key: string; label: string; value: string };

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("campaign-copy", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 24 * 1024);
  if (big) return big;

  let body: Obj;
  try {
    body = obj(await request.json());
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const topic = s(body.topic, 300);
  if (!topic) return Response.json({ error: "Нужна тематика или ТЗ" }, { status: 400 });
  const tz = s(body.brief, 600);
  const kind = body.kind === "sport" ? "sport" : "casino";
  const lang = typeof body.lang === "string" ? body.lang : "ru";
  const parts = obj(body.parts);
  const scene = obj(body.scene);
  const sceneFields = arr(scene.fields, 16)
    .map((f) => obj(f))
    .map((f) => ({ key: s(f.key, 24), label: s(f.label, 60), value: s(f.value, 120) }))
    .filter((f): f is SceneField => /^[a-zA-Z0-9_]+$/.test(f.key));
  const blocks = arr(body.blocks, 16).filter((b): b is string => typeof b === "string" && b in BLOCK_SHAPES);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const want: string[] = [
    '"headline": first-screen headline, <=32 chars, upper case',
    ...(parts.banner !== false || parts.email !== false ? ['"bannerText": the line on the 16:9 banner, <=60 chars (keep the offer)'] : []),
    ...(parts.playable !== false && sceneFields.length
      ? [
          `"scene": {${sceneFields.map((f) => `"${f.key}": "${f.label}" (now: "${f.value}", keep similar length)`).join(", ")}} — texts of the playable ad game "${s(scene.id, 24)}"`,
        ]
      : []),
    ...(parts.email !== false
      ? [
          '"email": {"subject": "<=60", "preheader": "<=90", "heroTitle": "<=60, may wrap the key offer in **double asterisks** for highlight", "heroSubtitle": "<=80", "body": "2-3 sentences, may use **bold**", "stepsTitle": "<=36", "steps": [3 short steps], "ctaText": "<=22, upper case"}',
        ]
      : []),
    ...(parts.landing !== false && blocks.length ? [`"blocks": {${blocks.map((b) => `"${b}": ${BLOCK_SHAPES[b]}`).join(", ")}}`] : []),
  ];

  const system = [
    `You are the copywriter of a ${kind === "sport" ? "sports-betting" : "online casino"} ad campaign. Write ALL texts in ${euLang(lang).english}.`,
    "One theme runs through every creative: landing page, playable ad, banner and promo email must read as one campaign.",
    "Keep proper names from the theme (characters, clubs, events) as they are. Concrete numbers in bonuses. No emoji.",
    OFFER_RULE,
    `Brand: ${s(body.brand, 40) || "—"}. Offer: ${s(body.offer, 80) || "—"} (use it as the main bonus everywhere). CTA: ${s(body.cta, 24) || "—"}.`,
    "Return STRICT JSON with exactly these keys:",
    ...want.map((w) => `- ${w}`),
  ].join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Theme: ${topic}${tz ? `\nFrom the brief: ${tz}` : ""}` },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    return Response.json({ error: "Провайдер недоступен", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: "Provider error", detail: (await res.text()).slice(0, 300) }, { status: 502 });
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  let j: Obj = {};
  try {
    j = obj(JSON.parse(data?.choices?.[0]?.message?.content || "{}"));
  } catch {
    /* ниже — пусто */
  }

  // Сокращения ТЗ в текстах — как прочтёт игрок (модель просили, но страхуемся): fs → фриспины, rub → ₽.
  const h = (v: string) => humanizeOffer(v, lang);
  const humanizeDeep = (v: unknown, key = ""): unknown =>
    typeof v === "string" ? (/^(code|odd|match)$/.test(key) ? v : h(v)) : Array.isArray(v) ? v.map((x) => humanizeDeep(x, key)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, humanizeDeep(x, k)])) : v;

  // Проверка: только ожидаемые поля и разумной длины; пустое — клиент оставит своё.
  const sceneOut: Record<string, string> = {};
  const sj = obj(j.scene);
  for (const f of sceneFields) {
    const v = s(sj[f.key], Math.max(24, Math.min(140, f.value.length * 2 + 12)));
    if (v) sceneOut[f.key] = h(v);
  }
  const ej = obj(j.email);
  const email: Record<string, unknown> = {};
  for (const [k, max] of [["subject", 70], ["preheader", 100], ["heroTitle", 80], ["heroSubtitle", 100], ["body", 420], ["stepsTitle", 44], ["ctaText", 26]] as const) {
    const v = s(ej[k], max);
    if (v) email[k] = h(v);
  }
  const steps = arr(ej.steps, 4).map((t) => s(t, 70)).filter(Boolean);
  if (steps.length >= 2) email.steps = steps.map(h);
  const bj = obj(j.blocks);
  const blocksOut: Record<string, Obj> = {};
  for (const b of blocks) {
    const c = cleanBlockCopy(b, obj(bj[b]));
    if (c) blocksOut[b] = humanizeDeep(c) as Obj;
  }

  void recordUsage(user.id, { model: MODEL, feature: "campaign-copy", type: "llm", ...extractUsage(data, MODEL) });
  return Response.json({
    copy: {
      topic,
      headline: h(s(j.headline, 40)),
      bannerText: h(s(j.bannerText, 80)),
      sceneId: s(scene.id, 24),
      scene: sceneOut,
      email,
      blocks: blocksOut,
    },
  });
}
