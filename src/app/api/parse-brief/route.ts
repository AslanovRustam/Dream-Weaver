// Parse an uploaded brief (ТЗ) — plain text, .docx or .pdf — and use gpt-4o-mini
// to extract structured field values + a generation prompt for the given product.
//
// Body: { product: SectionId, text?: string, fileBase64?: string, fileName?: string }
// Response: { fields: Record<string,string>, generationPrompt: string, briefChars: number }
import { BRIEF_SCHEMAS } from "@/lib/briefSchemas";
import type { SectionId } from "@/lib/sections";
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse } from "@/lib/request-guard";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";

const MAX_BRIEF_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BRIEF_TEXT_CHARS = 200_000;

const MAX_BRIEF_CHARS = 14000;

type Body = {
  product?: string;
  text?: string;
  fileBase64?: string;
  fileName?: string;
};

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value || "";
}

async function extractPdf(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const fontsDir =
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: pathToFileURL(fontsDir).href,
    disableFontFace: true, // no DOM font rendering in Node
    useSystemFonts: false,
  }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((it: unknown) =>
            it && typeof it === "object" && "str" in it ? String((it as { str: string }).str) : "",
          )
          .join(" ") + "\n";
    } catch {
      /* unreadable page — skip */
    }
  }
  return text;
}

export async function POST(request: Request) {
  // Paid call on the company's OpenAI key: sign-in + a per-user rate limit are
  // mandatory. This used to be `optionalUser` (never throws) with no limit —
  // anyone who knew the URL could drain the key anonymously.
  // `authedUser`, not `user` — this file builds a `const user` prompt message
  // further down and would shadow it.
  let authedUser: Awaited<ReturnType<typeof requireUser>>;
  try {
    authedUser = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("parse-brief", authedUser.id, 10, 60_000);
  if (rl) return rl;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const product = body.product as SectionId | undefined;
  const schema = product ? BRIEF_SCHEMAS[product] : undefined;
  if (!schema || schema.fields.length === 0) {
    return Response.json({ error: "Unknown or unsupported product" }, { status: 400 });
  }

  let brief = (body.text || "").trim();
  if (brief.length > MAX_BRIEF_TEXT_CHARS) {
    return Response.json({ error: "Текст ТЗ слишком большой" }, { status: 413 });
  }
  if (!brief && body.fileBase64) {
    const name = (body.fileName || "").toLowerCase();
    let buf: Buffer;
    try {
      const b64 = body.fileBase64.includes(",") ? body.fileBase64.split(",")[1] : body.fileBase64;
      // Cap BEFORE decoding/parsing: mammoth/pdfjs run in-process on whatever
      // arrives, and there is no framework-level body limit in the App Router.
      if (Math.floor((b64.length * 3) / 4) > MAX_BRIEF_FILE_BYTES) {
        return Response.json({ error: "Файл слишком большой (макс. 10 МБ)" }, { status: 413 });
      }
      buf = Buffer.from(b64, "base64");
    } catch {
      return Response.json({ error: "Не удалось прочитать файл" }, { status: 400 });
    }
    try {
      if (name.endsWith(".docx")) brief = await extractDocx(buf);
      else if (name.endsWith(".pdf")) brief = await extractPdf(buf);
      else if (name.endsWith(".txt") || name.endsWith(".md")) brief = buf.toString("utf8");
      else if (name.endsWith(".doc"))
        return Response.json(
          { error: "Формат .doc не поддерживается — сохраните как .docx или вставьте текст" },
          { status: 415 },
        );
      else brief = buf.toString("utf8");
    } catch (e) {
      return Response.json(
        { error: "Не удалось распознать файл", detail: e instanceof Error ? e.message : String(e) },
        { status: 422 },
      );
    }
  }

  brief = brief.replace(/\s+\n/g, "\n").trim();
  if (!brief) {
    return Response.json({ error: "Пустое ТЗ" }, { status: 400 });
  }
  const briefChars = brief.length;
  if (brief.length > MAX_BRIEF_CHARS) brief = brief.slice(0, MAX_BRIEF_CHARS);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }
  const providers = [
    { url: "https://api.openai.com/v1/chat/completions", key: apiKey, model: "gpt-4o-mini" },
  ];

  const fieldList = schema.fields
    .map((f) => `- ${f.key} (${f.label})${f.hint ? `: ${f.hint}` : ""}${f.enum ? ` [одно из: ${f.enum.join(", ")}]` : ""}`)
    .join("\n");

  const system =
    "Ты — ассистент, который читает маркетинговое ТЗ (техническое задание) и извлекает данные для " +
    `создания продукта «${schema.genHint}». Верни СТРОГО валидный JSON без markdown. ` +
    "Формат: {\"fields\": {<ключ>: <значение на языке ТЗ>}, \"generationPrompt\": <строка>}. " +
    "В fields включай ТОЛЬКО те ключи из списка, для которых в ТЗ есть основание; не выдумывай. " +
    "Значения enum выбирай строго из предложенных вариантов. " +
    "generationPrompt — 1–3 ёмких предложения, готовый бриф для генерации продукта из этого ТЗ.";

  const user = `ПОЛЯ ПРОДУКТА:\n${fieldList}\n\nТЗ:\n"""${brief}"""`;

  let content = "";
  let lastDetail = "";
  let usedModel = "";
  let usageData: unknown = null;
  for (const p of providers) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        lastDetail = (await res.text()).slice(0, 300);
        continue;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content ?? "";
      if (content) {
        usedModel = p.model;
        usageData = data;
        break;
      }
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : String(e);
    }
  }
  if (!content) {
    return Response.json({ error: "LLM request failed", detail: lastDetail }, { status: 502 });
  }

  const usage = extractUsage(usageData);
  await recordUsage(authedUser.id, { model: usedModel, feature: "parse-brief", type: "llm", ...usage });

  let parsed: { fields?: Record<string, unknown>; generationPrompt?: unknown };
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
  } catch {
    return Response.json({ error: "LLM returned non-JSON", detail: content.slice(0, 300) }, { status: 502 });
  }

  const fields: Record<string, string> = {};
  for (const f of schema.fields) {
    const raw = parsed.fields?.[f.key];
    if (raw == null) continue;
    let val = String(raw).trim();
    if (!val) continue;
    if (f.enum && !f.enum.includes(val)) continue;
    fields[f.key] = val;
  }
  const generationPrompt = typeof parsed.generationPrompt === "string" ? parsed.generationPrompt.trim() : "";

  return Response.json({ fields, generationPrompt, briefChars, costUsd: usage.costUsd });
}
