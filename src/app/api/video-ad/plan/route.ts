// POST /api/video-ad/plan — арт-директор ролика: смотрит на баннер (и пожелание /
// ТЗ, если есть) и решает, что в нём оживить. Кредиты не списываются.
// Body: { image: https | data URL, wish?: string, brief?: string }
// Response: VideoAdPlan
import { authErrorResponse, requireUser } from "@/lib/auth-server";
import { llmJson } from "@/lib/llm";
import { assertImageDataUrl, rateLimitResponse, rejectLargeBody } from "@/lib/request-guard";
import { safeFetchImage } from "@/lib/safe-fetch";
import { extractUsage, recordUsage } from "@/lib/usage";
import { VIDEO_AD_DEFAULT_DURATION, VIDEO_AD_DURATIONS, type VideoAdPlan } from "@/lib/videoAd/spec";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.VIDEO_PLAN_MODEL || "gpt-5.4-mini";

const SYSTEM = [
  "You are a motion director of short performance video ads (Reels, TikTok, Shorts). You get ONE finished static ad banner.",
  "An image-to-video model will animate THIS EXACT banner as the first frame. Decide how to bring it to life so it stops the scroll in the first second.",
  "Hard rules for the motion prompt (the model obeys plain English):",
  "- All text, numbers, logos, buttons and badges stay perfectly still, sharp and unchanged: no morphing, no new letters, no new text, no subtitles.",
  "- Animate what is safe to animate: background depth, light rays, glow, particles, sparks, smoke, confetti, coins, liquid, fabric, hair, subtle character motion (breathing, blink, small gesture, turning head), objects floating.",
  "- One slow, confident camera move (gentle push-in, slight parallax or orbit). No cuts, no scene changes, no new people, no talking, no zoom out that reveals empty space.",
  "- First second: a clear burst of energy (flash, sparks burst, coins popping) so the frame is alive immediately.",
  "- Keep the brand colors and the art style of the banner.",
  "Sound (audio=true): energetic background music and matching sound effects, no voice. Set audio=false only when the banner is clearly for a silent placement or the user asked for silence.",
  "duration: total seconds of the final ad, one of " + VIDEO_AD_DURATIONS.join(", ") + ". Default " + VIDEO_AD_DEFAULT_DURATION + "; 6 for a single punchy idea; 15 only if the user asked for longer.",
  "endCard: true (recommended) — the final 2 seconds show the original banner so the offer and the button are perfectly readable.",
  "If the user gave a wish or brief, follow it within the rules above.",
  "title: 2–4 word Russian name of the idea. idea: 1–2 short Russian sentences describing what the viewer will see.",
  "prompt: 60–110 English words, present tense, describing the motion of this banner.",
  'Return STRICT JSON {"title":string,"idea":string,"prompt":string,"audio":boolean,"duration":number,"endCard":boolean}.',
].join("\n");

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(request);
  } catch (err) {
    return authErrorResponse(err);
  }
  const rl = await rateLimitResponse("video-ad-plan", user.id, 20, 60_000);
  if (rl) return rl;
  const big = rejectLargeBody(request, 14 * 1024 * 1024);
  if (big) return big;
  let body: { image?: string; wish?: string; brief?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  let image = String(body.image ?? "");
  if (/^https:\/\//.test(image)) {
    try {
      const { buffer, mime } = await safeFetchImage(image);
      image = `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return Response.json({ error: "Не удалось загрузить баннер" }, { status: 400 });
    }
  }
  const bad = assertImageDataUrl("image", image);
  if (bad) return bad;
  const wish = str(body.wish, 1200);
  const brief = str(body.brief, 3000);
  try {
    const r = await llmJson({
      model: MODEL,
      system: SYSTEM,
      parts: [
        {
          type: "text",
          text: [wish ? `USER WISH:\n"""${wish}"""` : "", brief ? `BRIEF (ТЗ):\n"""${brief}"""` : "", "BANNER:"]
            .filter(Boolean)
            .join("\n\n"),
        },
        { type: "image", url: image, detail: "high" },
      ],
      effort: "low",
      maxTokens: 6_000,
      timeoutMs: 50_000,
    });
    await recordUsage(user.id, { model: r.model, feature: "video-ad-plan", type: "llm", ...extractUsage({ usage: r.usage }, MODEL) });
    const j = r.json as Record<string, unknown>;
    const d = Number(j.duration);
    const plan: VideoAdPlan = {
      title: str(j.title, 60) || "Оживший баннер",
      idea: str(j.idea, 400),
      prompt: str(j.prompt, 1500),
      audio: j.audio !== false,
      duration: (VIDEO_AD_DURATIONS as readonly number[]).includes(d) ? d : VIDEO_AD_DEFAULT_DURATION,
      endCard: j.endCard !== false,
    };
    if (!plan.prompt) throw new Error("empty prompt");
    return Response.json(plan);
  } catch {
    return Response.json({ error: "Не удалось придумать движение — попробуйте ещё раз" }, { status: 502 });
  }
}
