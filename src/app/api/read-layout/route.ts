// Разметка баннера для пересборки по слоям: каждая надпись — с ролью и рамкой, плюс рамки
// лиц персонажей (людей, маскотов, животных). Лица — жёсткое правило раскладки: на них
// не кладётся ни текст, ни кнопка, ни декор.
//
// Body: { image: data:image/… | https://… }
// Response: { texts: {text, role, box:[x,y,w,h]}[], faces: [x,y,w,h][] } — доли кадра 0..1.
// Кредиты не списываются (центы); лимит — на пользователя.
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { safeFetchImage } from "@/lib/safe-fetch";
import { extractUsage, recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gpt-5.4-mini";
const ROLES = ["headline", "offer", "button", "feature", "brand", "legal", "other"] as const;

const SYSTEM = [
  "You analyse the layout of an advertising banner image.",
  "1) List EVERY piece of readable text, one entry per visual block (a multi-line headline is ONE entry; an offer like '350 € + 250 free spins' spread over lines is ONE entry).",
  "   role: headline (main title) | offer (bonus / money / percent / free spins) | button (call-to-action label on a button) | feature (short benefit items, often with icons, in a list or row) | brand (brand / casino name, logo wordmark) | legal (18+, play responsibly, terms) | other (speech bubbles, labels inside the scene).",
  "   box: the tight bounding box of that text block as [x, y, width, height] in FRACTIONS of the image (0..1, origin top-left). For a button, the box of the WHOLE button shape.",
  "2) faces: the bounding box of EVERY face or head of a character — people, mascots, cartoon characters, animals, dragons, gods — [x, y, width, height] in fractions, from the top of the hair/crown/horns to the chin.",
  'Return strict JSON: {"texts": [{"text": string, "role": string, "box": [number, number, number, number]}], "faces": [[number, number, number, number]]}.',
].join("\n");

type Box = [number, number, number, number];
const clampBox = (b: unknown): Box | null => {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [x, y, w, h] = b.map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const cx = Math.min(1, Math.max(0, x));
  const cy = Math.min(1, Math.max(0, y));
  return [cx, cy, Math.min(1 - cx, w), Math.min(1 - cy, h)];
};

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("read-layout", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 12 * 1024 * 1024);
  if (big) return big;
  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  let image = (body.image ?? "").trim();
  if (/^https?:\/\//.test(image)) {
    try {
      const { buffer, mime } = await safeFetchImage(image);
      image = `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return Response.json({ error: "Не удалось загрузить баннер" }, { status: 400 });
    }
  }
  const bad = assertImageDataUrl("image", image);
  if (bad) return bad;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: [{ type: "image_url", image_url: { url: image, detail: "high" } }] },
        ],
      }),
      signal: AbortSignal.timeout(50_000),
    });
    const data = await res.json();
    if (!res.ok) return Response.json({ error: "Разметка недоступна" }, { status: 502 });
    await recordUsage(user.id, { model: MODEL, feature: "read-layout", type: "llm", ...extractUsage(data, MODEL) });
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as {
      texts?: { text?: unknown; role?: unknown; box?: unknown }[];
      faces?: unknown[];
    };
    const texts = (parsed.texts ?? [])
      .map((t) => ({
        text: String(t.text ?? "").trim().slice(0, 120),
        role: (ROLES as readonly string[]).includes(String(t.role)) ? String(t.role) : "other",
        box: clampBox(t.box),
      }))
      .filter((t) => t.text && t.box);
    const faces = (parsed.faces ?? []).map(clampBox).filter((b): b is Box => !!b);
    return Response.json({ texts, faces });
  } catch {
    return Response.json({ error: "Разметка недоступна" }, { status: 502 });
  }
}
