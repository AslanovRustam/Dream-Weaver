// xAI Grok Imagine Video: картинка → видео. Только сервер.
//
// POST /v1/videos/generations {model, prompt, image:{url}, duration, resolution,
// generate_audio} → {request_id}; GET /v1/videos/{id} → {status: pending|done|
// failed|expired, video:{url, duration, respect_moderation}, error:{code,message}}.
// Пропорции клипа — как у входной картинки. Ссылка на готовый ролик временная:
// забираем файл к себе сразу (status-роут).
// Ключ — XAI_API_KEY (тот же, что у запасной генерации картинок, lib/grokImage).

const BASE = "https://api.x.ai/v1";

export const videoConfigured = () => !!process.env.XAI_API_KEY?.trim();

const headers = () => ({
  Authorization: `Bearer ${process.env.XAI_API_KEY?.trim()}`,
  "Content-Type": "application/json",
});

/** Текст ошибки xAI без лишнего: message из JSON или начало ответа. */
function errorText(raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: string | { message?: string }; message?: string };
    const e = typeof j.error === "string" ? j.error : j.error?.message;
    return (e || j.message || raw).slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

export async function startVideo(a: {
  model: string;
  prompt: string;
  imageUrl: string;
  duration: number;
  resolution: "720p" | "1080p";
  audio: boolean;
}): Promise<string> {
  const res = await fetch(`${BASE}/videos/generations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: a.model,
      prompt: a.prompt,
      image: { url: a.imageUrl },
      duration: a.duration,
      resolution: a.resolution,
      generate_audio: a.audio,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`xAI ${res.status}: ${errorText(raw)}`);
  const id = (JSON.parse(raw) as { request_id?: string }).request_id;
  if (!id) throw new Error("xAI: нет request_id");
  return id;
}

export type VideoPoll =
  | { status: "pending"; progress?: number }
  | { status: "done"; url: string; duration?: number }
  | { status: "failed"; error: string };

export async function pollVideo(requestId: string): Promise<VideoPoll> {
  const res = await fetch(`${BASE}/videos/${encodeURIComponent(requestId)}`, {
    headers: headers(),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.text();
  // Сеть / перегрузка — не приговор заданию: спросим ещё раз.
  if (res.status >= 500 || res.status === 429) return { status: "pending" };
  if (!res.ok) return { status: "failed", error: `xAI ${res.status}: ${errorText(raw)}` };
  const j = JSON.parse(raw) as {
    status?: string;
    progress?: number;
    video?: { url?: string; duration?: number; respect_moderation?: boolean };
    error?: { code?: string; message?: string };
  };
  if (j.status === "done") {
    if (j.video?.respect_moderation === false || !j.video?.url)
      return { status: "failed", error: "Видео не прошло модерацию xAI — попробуйте другой баннер или идею" };
    return { status: "done", url: j.video.url, duration: j.video.duration };
  }
  if (j.status === "failed" || j.status === "expired")
    return { status: "failed", error: j.error?.message?.slice(0, 300) || (j.status === "expired" ? "Задание устарело" : "Генерация не удалась") };
  return { status: "pending", progress: typeof j.progress === "number" ? j.progress : undefined };
}
