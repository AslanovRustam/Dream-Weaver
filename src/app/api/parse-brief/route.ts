// Parse an uploaded brief (ТЗ) — plain text, .docx or .pdf — and use gpt-4o-mini
// to extract structured field values + a generation prompt for the given product.
//
// Body: { product: SectionId, text?: string, fileBase64?: string, fileName?: string }
// Response: { fields: Record<string,string>, generationPrompt: string, briefChars: number }
import { BRIEF_SCHEMAS } from "@/lib/briefSchemas";
import type { SectionId } from "@/lib/sections";

export const runtime = "nodejs";

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
  // Legacy build runs on the main thread in Node (no worker needed).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  // Point pdf.js at its bundled standard fonts; without this many real-world
  // PDFs throw "Ensure that the standardFontDataUrl API parameter is provided".
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
    // Skip a page that fails rather than failing the whole document.
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

  // Resolve the brief text from either raw text or an uploaded file.
  let brief = (body.text || "").trim();
  if (!brief && body.fileBase64) {
    const name = (body.fileName || "").toLowerCase();
    let buf: Buffer;
    try {
      const b64 = body.fileBase64.includes(",") ? body.fileBase64.split(",")[1] : body.fileBase64;
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

  // LLM keys are system-side. Try OpenAI first, then OpenRouter (same model).
  const providers = [
    process.env.OPENAI_API_KEY && {
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
    },
    process.env.OPENROUTER_API_KEY && {
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: "openai/gpt-4o-mini",
    },
  ].filter(Boolean) as { url: string; key: string; model: string }[];

  if (providers.length === 0) {
    return Response.json(
      { error: "Нет ключа LLM (OPENAI_API_KEY / OPENROUTER_API_KEY)" },
      { status: 500 },
    );
  }

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
        continue; // try the next provider
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content ?? "";
      if (content) break;
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : String(e);
    }
  }
  if (!content) {
    return Response.json({ error: "LLM request failed", detail: lastDetail }, { status: 502 });
  }

  let parsed: { fields?: Record<string, unknown>; generationPrompt?: unknown };
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
  } catch {
    return Response.json({ error: "LLM returned non-JSON", detail: content.slice(0, 300) }, { status: 502 });
  }

  // Keep only known keys; coerce to strings; validate enums.
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

  return Response.json({ fields, generationPrompt, briefChars });
}
