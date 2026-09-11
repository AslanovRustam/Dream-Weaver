// Suggest text for a landing field based on the user's "Тематика" (theme).
// A cheap gpt-4o-mini call, OpenAI-direct. Fills headline/CTA text, or writes
// an image-generation prompt for the background / character.
//
// Body: { topic: string, field: "headline"|"cta"|"bg"|"character", mechanic?: string }
// Response: { text: string }
import { optionalUser } from "@/lib/auth-server";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";

type Field = "headline" | "cta" | "bg" | "character";
type Body = { topic?: string; field?: Field; mechanic?: string };

const MECH_LABEL: Record<string, string> = {
  wheel: "колесо фортуны (fortune wheel)",
  slot: "слот-машина (slot machine)",
  crash: "crash-игра (rising multiplier)",
};

function buildMessages(theme: string, field: Field, mechanic: string) {
  const mech = MECH_LABEL[mechanic] || "гемблинг-механика";
  switch (field) {
    case "headline":
      return {
        system:
          "Ты — маркетолог iGaming. Придумай ОДИН короткий цепляющий заголовок (2–5 слов) для гемблинг-лендинга. " +
          "Верни ТОЛЬКО текст заголовка на русском, БЕЗ кавычек, без пояснений. Можно капсом.",
        user: `Механика лендинга: ${mech}. Тематика/пожелания: ${theme}`,
      };
    case "cta":
      return {
        system:
          "Ты — маркетолог iGaming. Придумай ОЧЕНЬ короткий текст кнопки-CTA (1–2 слова, напр. «КРУТИТЬ», «ИГРАТЬ», «ЗАБРАТЬ БОНУС»). " +
          "Верни ТОЛЬКО текст кнопки на русском, без кавычек.",
        user: `Механика: ${mech}. Тематика: ${theme}`,
      };
    case "bg":
      return {
        system:
          "You are an art director. Write a concise (1–2 sentences) description IN ENGLISH of a themed BACKGROUND SCENE " +
          "for a gambling landing (setting, mood, colours, key visual motifs). Do NOT mention composition, an empty center, " +
          "people, framing or 'no text' — that is added automatically. Return ONLY the scene description.",
        user: `Mechanic that will sit in the center: ${mech}. Theme / wishes: ${theme}`,
      };
    case "character":
      return {
        system:
          "You are an art director. Write a concise description IN ENGLISH of a MASCOT CHARACTER for a gambling landing — " +
          "who/what it is, key attributes, outfit and vibe, fitting the theme; tasteful and fully clothed. " +
          "Do NOT mention render style, framing or background — that is added automatically. Return ONLY the character description.",
        user: `Landing mechanic: ${mech}. Theme / wishes: ${theme}`,
      };
  }
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const theme = (body.topic || "").trim().slice(0, 500);
  const field = body.field as Field;
  const mechanic = (body.mechanic || "").trim();
  if (!theme) return Response.json({ error: "Заполните тематику" }, { status: 400 });
  if (!["headline", "cta", "bg", "character"].includes(field)) {
    return Response.json({ error: "Unknown field" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const { system, user } = buildMessages(theme, field, mechanic);
  let content = "";
  let usageData: unknown = null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      return Response.json({ error: "LLM недоступен", detail: (await res.text()).slice(0, 200) }, { status: 502 });
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    usageData = data;
    content = (data.choices?.[0]?.message?.content ?? "").trim();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Ошибка запроса" }, { status: 502 });
  }

  // Strip stray wrapping quotes/backticks the model sometimes adds.
  const text = content.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!text) return Response.json({ error: "Пустой ответ" }, { status: 502 });

  const authed = await optionalUser(request);
  if (authed) {
    await recordUsage(authed.id, {
      model: "gpt-4o-mini",
      feature: `landing-suggest-${field}`,
      type: "llm",
      ...extractUsage(usageData),
    });
  }

  return Response.json({ text });
}
