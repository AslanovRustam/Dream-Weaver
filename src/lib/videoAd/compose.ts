// Сборка ролика в браузере: MP4 нужного формата из ИИ-клипа или из баннера.
//
//   ИИ-клип  — кадры клипа по центру; если пропорции формата другие, поля —
//              его же размытая копия. Звук клипа сохраняется, к концу затухает.
//   Моушн    — без ИИ: баннер с наездом камеры, вспышкой на старте, бликом и
//              искрами по ярким местам.
//   Концовка — последние END_CARD_S секунд: исходный баннер, чтобы оффер и
//              кнопка читались ровно как на креативе.
// Кодирует WebCodecs (H.264 + AAC/Opus) через mediabunny. Только клиент.
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";

import { shineMask, sparkPoints } from "@/lib/bannerGif";
import { END_CARD_S } from "./spec";

const FPS = 30;
/** Переход клип → концовка, с. */
const FADE_S = 0.35;
/** Звук затухает перед концом клипа, с. */
const AUDIO_FADE_S = 0.6;

type Src = CanvasImageSource & { width?: number; height?: number };

export type ComposeArgs = {
  w: number;
  h: number;
  /** Длина ролика, с (с клипом — длина клипа + концовка, не больше). */
  total: number;
  endCard: boolean;
  /** Исходный баннер, уже загруженный (концовка, моушн, поля). */
  banner: HTMLImageElement;
  /** ИИ-клип. Нет — моушн из баннера. */
  clip?: Blob;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
};

/** Загрузить картинку (data: / blob: — без CORS-хлопот). */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function sizeOf(s: Src): { w: number; h: number } {
  if (s instanceof HTMLImageElement) return { w: s.naturalWidth, h: s.naturalHeight };
  return { w: Number(s.width), h: Number(s.height) };
}

/** Размытый фон «cover»: картинка в крошечный холст и обратно — дёшево и везде работает. */
function makeBlurrer() {
  const tiny = document.createElement("canvas");
  return (ctx: CanvasRenderingContext2D, src: Src, W: number, H: number) => {
    const { w, h } = sizeOf(src);
    const k = Math.max(W / w, H / h);
    tiny.width = Math.max(4, Math.round((W / 28) | 0));
    tiny.height = Math.max(4, Math.round((H / 28) | 0));
    const t = tiny.getContext("2d")!;
    const sw = W / k;
    const sh = H / k;
    t.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, tiny.width, tiny.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tiny, 0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, W, H);
  };
}

/** Прямоугольник «contain» (или «cover», если пропорции почти совпали — без полей). */
function fitRect(sw: number, sh: number, W: number, H: number) {
  const close = Math.abs(sw / sh / (W / H) - 1) < 0.04;
  const k = close ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const w = sw * k;
  const h = sh * k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, full: close };
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));

/** Блик: диагональная полоса света проходит по прямоугольнику r за фазу p ∈ [0,1]. */
function shine(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, p: number, alpha: number) {
  if (p <= 0 || p >= 1) return;
  const span = r.w + r.h;
  const cx = r.x - r.h + span * p;
  const g = ctx.createLinearGradient(cx - r.w * 0.18, r.y, cx + r.w * 0.18, r.y + r.h * 0.35);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** Искры по ярким местам баннера (доли 0…1 от его размеров). */
function brightPoints(img: HTMLImageElement, n: number): { x: number; y: number; ph: number }[] {
  const S = 96;
  const { w, h } = sizeOf(img);
  const k = S / Math.max(w, h);
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.round(w * k));
  c.height = Math.max(8, Math.round(h * k));
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, c.width, c.height);
  const px = x.getImageData(0, 0, c.width, c.height).data;
  return sparkPoints(shineMask(px, c.width, c.height), c.width, c.height, n).map((p, i) => ({
    x: p.x / c.width,
    y: p.y / c.height,
    ph: (i * 0.37) % 1,
  }));
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, a: number) {
  if (a <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,200,0.6)");
  g.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x, y, x, y + size);
  ctx.quadraticCurveTo(x, y, x - size, y);
  ctx.quadraticCurveTo(x, y, x, y - size);
  ctx.fill();
  ctx.restore();
}

export async function composeVideoAd(a: ComposeArgs): Promise<Blob> {
  const { w: W, h: H } = a;
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: W, height: H });
  if (!codec) throw new Error("Браузер не умеет кодировать видео — откройте раздел в Chrome или Edge");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const blur = makeBlurrer();
  const banner = a.banner;
  const bs = sizeOf(banner);
  const bRect = fitRect(bs.w, bs.h, W, H);

  // ИИ-клип: дорожки и длина.
  let input: Input | null = null;
  let clipDur = 0;
  let sink: CanvasSink | null = null;
  let audioTrack: Awaited<ReturnType<Input["getPrimaryAudioTrack"]>> = null;
  if (a.clip) {
    input = new Input({ source: new BlobSource(a.clip), formats: ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new Error("В клипе нет видео");
    clipDur = await input.computeDuration();
    sink = new CanvasSink(vt, { poolSize: 2 });
    audioTrack = await input.getPrimaryAudioTrack();
  }
  const endS = a.endCard ? END_CARD_S : 0;
  const bodyS = a.clip ? Math.min(clipDur, Math.max(1, a.total - endS)) : Math.max(1, a.total - endS);
  const total = bodyS + endS;
  const frames = Math.round(total * FPS);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });

  let audio: AudioBufferSource | null = null;
  if (audioTrack) {
    const ac = await getFirstEncodableAudioCodec(["aac", "opus"], {
      numberOfChannels: audioTrack.numberOfChannels,
      sampleRate: audioTrack.sampleRate,
    });
    if (ac) {
      audio = new AudioBufferSource({ codec: ac, quality: QUALITY_HIGH });
      output.addAudioTrack(audio);
    }
  }
  await output.start();

  const sparks = a.clip ? [] : brightPoints(banner, 7);
  const last = document.createElement("canvas"); // последний кадр тела — для перехода в концовку
  last.width = W;
  last.height = H;

  const drawBanner = (scale: number, dx = 0, dy = 0) => {
    if (!bRect.full) blur(ctx, banner, W, H);
    const w = bRect.w * scale;
    const h = bRect.h * scale;
    ctx.drawImage(banner, (W - w) / 2 + dx * W, (H - h) / 2 + dy * H, w, h);
  };

  const videoLoop = async () => {
    const times = function* () {
      for (let i = 0; i < frames; i++) {
        const t = i / FPS;
        if (t < bodyS) yield Math.min(t, Math.max(0, clipDur - 0.001));
      }
    };
    const clipFrames = sink ? sink.canvasesAtTimestamps(times()) : null;
    for (let i = 0; i < frames; i++) {
      if (a.signal?.aborted) throw new DOMException("Отменено", "AbortError");
      const t = i / FPS;
      ctx.globalAlpha = 1;
      if (t < bodyS) {
        if (clipFrames) {
          const fr = (await clipFrames.next()).value;
          if (fr) {
            const c = fr.canvas as Src;
            const s = sizeOf(c);
            const r = fitRect(s.w, s.h, W, H);
            if (!r.full) blur(ctx, c, W, H);
            ctx.drawImage(c, r.x, r.y, r.w, r.h);
          }
        } else {
          // Моушн: вход с наезда + вспышка, дальше медленный наезд, блик каждые ~3 с, искры.
          const intro = ease(t / 0.6);
          const scale = 1.1 - 0.1 * intro + 0.06 * (t / bodyS);
          drawBanner(scale, 0, -0.008 * (t / bodyS));
          const r = { x: (W - bRect.w * scale) / 2, y: (H - bRect.h * scale) / 2, w: bRect.w * scale, h: bRect.h * scale };
          shine(ctx, r, ((t - 0.5) % 3) / 1.1, 0.33);
          for (const p of sparks) {
            const ph = (t / 1.6 + p.ph) % 1;
            sparkle(ctx, r.x + p.x * r.w, r.y + p.y * r.h, Math.min(W, H) * 0.035, Math.sin(Math.PI * ph) ** 3 * 0.9);
          }
          if (t < 0.45) {
            ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - t / 0.45)})`;
            ctx.fillRect(0, 0, W, H);
          }
        }
        if (t + 1 / FPS >= bodyS) last.getContext("2d")!.drawImage(canvas, 0, 0);
      } else {
        // Концовка: баннер «садится» на место, блик по нему, переход из последнего кадра.
        const e = t - bodyS;
        drawBanner(1.04 - 0.04 * ease(e / 0.5));
        shine(ctx, bRect, (e - 0.45) / 0.9, 0.4);
        if (e < FADE_S) {
          ctx.globalAlpha = 1 - e / FADE_S;
          ctx.drawImage(last, 0, 0);
          ctx.globalAlpha = 1;
        }
      }
      await video.add(t, 1 / FPS);
      if (i % 10 === 0) a.onProgress?.(i / frames);
    }
    await clipFrames?.return(undefined);
    video.close();
  };

  const audioLoop = async () => {
    if (!audio || !audioTrack) return;
    const fadeFrom = bodyS - AUDIO_FADE_S;
    for await (const wb of new AudioBufferSink(audioTrack).buffers(0, bodyS)) {
      const buf = wb.buffer;
      const sr = buf.sampleRate;
      if (wb.timestamp + buf.duration > fadeFrom) {
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < d.length; i++) {
            const t = wb.timestamp + i / sr;
            if (t > fadeFrom) d[i] *= Math.max(0, (bodyS - t) / AUDIO_FADE_S);
          }
        }
      }
      await audio.add(buf);
    }
    audio.close();
  };

  try {
    await Promise.all([videoLoop(), audioLoop()]);
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    input?.dispose?.();
  }
  a.onProgress?.(1);
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error("Пустой ролик");
  return new Blob([buf], { type: "video/mp4" });
}
