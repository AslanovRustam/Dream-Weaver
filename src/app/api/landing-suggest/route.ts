// Suggest text for a landing field based on the user's "Тематика" (theme).
// A cheap gpt-4o-mini call, OpenAI-direct. Fills headline/CTA text, or writes
// an image-generation prompt for the background / character.
//
// Body: { topic: string, field: "headline"|"cta"|"bg"|"character"|"icon", mechanic?: string }
// Response: { text: string }
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";

type Field = "headline" | "cta" | "bg" | "character" | "icon" | "teams";
type Body = { topic?: string; field?: Field; mechanic?: string };

const MECH_LABEL: Record<string, string> = {
  wheel: "колесо фортуны (fortune wheel)",
  slot: "слот-машина (slot machine)",
  crash: "crash-игра (rising multiplier)",
  match: "матч-прогноз (pick the match winner, sports betting)",
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
    // Icon prompts. The generators already pin down shape, angle, transparent
    // background and slicing, so these only describe the SUBJECT and look.
    // Two invented club names for the match card, "A vs B". Real clubs are
    // trademarks — the generator is told to avoid them.
    case "teams":
      return {
        system:
          "Ты — маркетолог спортивного беттинга. Придумай ДВА ВЫМЫШЛЕННЫХ названия команд/клубов под тематику " +
          "(не используй реальные клубы, лиги и города-бренды вроде «Реал» или «Барселона»). Короткие, 1–2 слова каждое, " +
          "на языке тематики. Верни ТОЛЬКО строку вида «Команда А vs Команда Б», без кавычек и пояснений.",
        user: `Тематика: ${theme}`,
      };
    case "icon":
      if (mechanic === "match") {
        return {
          system:
            "You are an art director. Write a concise (1 sentence) description IN ENGLISH of the visual theme for an " +
            "INVENTED sports club crest — heraldic symbol idea, colors, material/finish — fitting the theme. Never " +
            "reference real clubs or leagues. Do NOT mention shape, framing or background — that is added automatically. " +
            "Return ONLY the theme description.",
          user: `Theme / wishes: ${theme}`,
        };
      }
      return mechanic === "slot"
        ? {
            system:
              "You are an art director. Write a concise (1 sentence) description IN ENGLISH of the visual theme for a SET " +
              "of slot-machine symbol icons — what kind of objects they are, material/finish and palette, fitting the theme. " +
              "Do NOT list individual symbols, and do NOT mention layout, grid, framing or background — that is added " +
              "automatically. Return ONLY the theme description.",
            user: `Theme / wishes: ${theme}`,
          }
        : {
            system:
              "You are an art director. Write a concise (1 sentence) description IN ENGLISH of a single ROCKET-like icon for " +
              "a crash-game landing — what the object is, its material/finish and palette, fitting the theme. " +
              "Do NOT mention angle, tilt, framing, trail or background — that is added automatically. " +
              "Return ONLY the object description.",
            user: `Theme / wishes: ${theme}`,
          };
  }
}

export async function POST(request: Request) {
  // Paid call on the company's OpenAI key: sign-in + a per-user rate limit are
  // mandatory. This used to be `optionalUser` (never throws) with no limit —
  // anyone who knew the URL could drain the key anonymously.
  // Named `authedUser`, not `user` — buildMessages() below destructures a
  // `user` (the prompt's user-role message) and would shadow it.
  let authedUser: Awaited<ReturnType<typeof requireUser>>;
  try {
    authedUser = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("landing-suggest", authedUser.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 256 * 1024);
  if (big) return big;

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
  if (!["headline", "cta", "bg", "character", "icon", "teams"].includes(field)) {
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

  const text = content.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!text) return Response.json({ error: "Пустой ответ" }, { status: 502 });

  await recordUsage(authedUser.id, {
    model: "gpt-4o-mini",
    feature: `landing-suggest-${field}`,
    type: "llm",
    ...extractUsage(usageData, "gpt-4o-mini"),
  });

  return Response.json({ text });
}
