"use client";

// Общие настройки лендингов-механик (колесо, слот, краш, матч): язык, юр.
// текст, трекинг и блоки под первым экраном. Значение — LandingExtras из
// src/lib/landingKit.ts; механика кладёт его в свой черновик и в выгрузку.
import { useEffect, useRef, useState } from "react";
import { ImageIcon, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { CollapsibleSection } from "@/components/landing/CollapsibleSection";
import { AssetRunPanel } from "@/components/landing/AssetRunPanel";
import { useAuthGate } from "@/components/AuthGate";
import { useAssetRun, type AssetStep } from "@/lib/useAssetRun";
import { apiFetch } from "@/lib/api-client";
import { PLAYABLE_ASSET_PRICE_CREDITS } from "@/lib/credit-estimate";
import { prepareSprite } from "@/lib/scenes/art";
import {
  LANDING_LANGS,
  buildExtrasPreviewHtml,
  relocalizeExtras,
  type LandingExtras,
  type LandingKind,
  type LandingLang,
  type LandingLines,
  type LandingStyle,
} from "@/lib/landingKit";

const INPUT = "h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";
const AREA = "w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent-green";
const CHIP_ON = "border-accent-green bg-accent-green/10 text-accent-green";
const CHIP_OFF = "border-border text-foreground/70 hover:bg-white/5";

const LINE_OPTIONS: { id: LandingLines; label: string }[] = [
  { id: "auto", label: "Авто" },
  { id: "rays", label: "Лучи" },
  { id: "arcs", label: "Дуги" },
  { id: "off", label: "Без линий" },
];

const STYLE_OPTIONS: { id: LandingStyle; label: string; hint: string }[] = [
  { id: "vivid", label: "Яркий", hint: "Золото, бейджи, монеты, блики — классика казино" },
  { id: "premium", label: "Премиум", hint: "Тёмный фон, один акцент, тонкий шрифт — для премиальных брендов" },
];

const BONUS_STYLE = "glossy 3D casino promo illustration, polished gold, vivid saturated colours, soft studio light";

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === "string" ? resolve(r.result) : reject(new Error("read")));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

export function LandingExtrasPanel({
  value: x,
  onChange,
  kind,
  mechanic,
}: {
  value: LandingExtras;
  onChange: (next: LandingExtras) => void;
  kind: LandingKind;
  /** Для ключа очереди ИИ-иллюстраций: у каждой механики свой. */
  mechanic: string;
}) {
  const { isGuest, openGate } = useAuthGate();
  // Последнее значение — для результатов генерации, которые приходят позже.
  const latest = useRef(x);
  latest.current = x;
  const patch = <K extends keyof LandingExtras>(k: K, v: Partial<LandingExtras[K]>) =>
    onChange({ ...latest.current, [k]: { ...(latest.current[k] as object), ...v } } as LandingExtras);

  const setBonusImage = (i: number, image: string | undefined) => {
    const cur = latest.current;
    onChange({ ...cur, bonuses: { ...cur.bonuses, items: cur.bonuses.items.map((b, j) => (j === i ? { ...b, image } : b)) } });
  };

  // ---- ИИ-иллюстрации карточек бонусов
  const applyAsset = async (key: string, dataUrl: string) => {
    const i = Number(key.replace("bonus-", ""));
    if (Number.isFinite(i)) setBonusImage(i, await prepareSprite(dataUrl, 360));
  };
  const assetRun = useAssetRun({ resumeKey: `dw_jobs_extras_${mechanic}`, apply: applyAsset });
  const runInTab = (body: Record<string, unknown>, key: string) => async () => {
    try {
      const res = await apiFetch("/api/generate-playable-asset", { method: "POST", json: body });
      const data = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "Не удалось сгенерировать");
      await applyAsset(key, data.imageUrl);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сгенерировать");
      return false;
    }
  };
  const steps = (): AssetStep[] =>
    x.bonuses.items
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.title.trim())
      .map(({ b, i }) => {
        const body = {
          kind: "object",
          style: BONUS_STYLE,
          subject: `an illustration for a casino bonus card titled "${b.title.slice(0, 80)}" (${b.text.slice(0, 120)}) — a single iconic object that represents this bonus, e.g. a gift box, coins, a chest, free-spin reels`,
        };
        return {
          id: `bonus-${i}`,
          label: `Карточка «${b.title.slice(0, 24)}»`,
          credits: PLAYABLE_ASSET_PRICE_CREDITS,
          run: runInTab(body, `bonus-${i}`),
          server: { route: "/api/generate-playable-asset", body },
        };
      });
  const credits = steps().reduce((s, st) => s + st.credits, 0);

  const uploadBonus = async (i: number, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setBonusImage(i, await prepareSprite(await readFile(file), 360));
    } catch {
      toast.error("Не удалось прочитать картинку");
    }
  };

  const changeLang = (lang: LandingLang) => {
    if (lang === x.lang) return;
    onChange(relocalizeExtras(x, lang, kind));
    toast("Тексты блоков, юр. текст и окна переведены. Свои правки в текстах — заново.");
  };

  const idBad = (v: string, re: RegExp) => !!v.trim() && !re.test(v.trim());

  return (
    <>
      <CollapsibleSection title="Первый экран" hint="Анимация появления, графика поверх фона">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={x.look.intro}
            onChange={(e) => patch("look", { intro: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--accent-green)]"
          />
          <span>
            Анимация появления
            <span className="block ds-caption">Буквы заголовка поднимаются, механика въезжает, кнопка раскрывается — около секунды при открытии.</span>
          </span>
        </label>
        <label className="mb-1.5 mt-3 block ds-caption">Линии поверх фона</label>
        <div className="grid grid-cols-2 gap-2">
          {LINE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => patch("look", { lines: o.id })}
              aria-pressed={x.look.lines === o.id}
              className={`rounded-lg border px-2 py-2 text-sm transition ${x.look.lines === o.id ? CHIP_ON : CHIP_OFF}`}
            >
              {o.id === "auto" ? (kind === "sport" ? "Авто — дуги" : "Авто — лучи") : o.label}
            </button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Язык, 18+ и трекинг" hint="Тексты окон, юр. строка, пиксели">
        <label className="mb-1.5 block ds-caption">Язык лендинга — тексты окон, кнопок и блоков</label>
        <div className="grid grid-cols-2 gap-2">
          {LANDING_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => changeLang(l.id)}
              aria-pressed={x.lang === l.id}
              className={`rounded-lg border px-2 py-2 text-sm transition ${x.lang === l.id ? CHIP_ON : CHIP_OFF}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <label className="mb-1.5 mt-3 block ds-caption">Юридический текст — внизу первого экрана и в подвале</label>
        <textarea rows={2} maxLength={300} value={x.legal} onChange={(e) => onChange({ ...x, legal: e.target.value })} className={AREA} />
        <p className="mt-1 ds-caption">Без 18+ и строки об ответственной игре сети и Meta гемблинг-страницы режут.</p>

        <label className="mb-1.5 mt-3 block ds-caption">Meta Pixel ID</label>
        <input value={x.tracking.metaPixel} onChange={(e) => patch("tracking", { metaPixel: e.target.value })} className={INPUT} placeholder="1234567890" />
        {idBad(x.tracking.metaPixel, /^\d{6,20}$/) ? <p className="mt-1 ds-caption text-amber-400">Только цифры — иначе пиксель не подключится</p> : null}
        <label className="mb-1.5 mt-2 block ds-caption">TikTok Pixel ID</label>
        <input value={x.tracking.tiktokPixel} onChange={(e) => patch("tracking", { tiktokPixel: e.target.value })} className={INPUT} placeholder="C1A2B3C4D5E6F7" />
        {idBad(x.tracking.tiktokPixel, /^[A-Za-z0-9]{10,30}$/) ? <p className="mt-1 ds-caption text-amber-400">Латиница и цифры, 10–30 символов</p> : null}
        <label className="mb-1.5 mt-2 block ds-caption">Google Tag Manager</label>
        <input value={x.tracking.gtm} onChange={(e) => patch("tracking", { gtm: e.target.value })} className={INPUT} placeholder="GTM-XXXXXX" />
        {idBad(x.tracking.gtm, /^GTM-[A-Za-z0-9]{4,12}$/) ? <p className="mt-1 ds-caption text-amber-400">Формат GTM-XXXXXX</p> : null}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={x.tracking.passParams}
            onChange={(e) => patch("tracking", { passParams: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--accent-green)]"
          />
          <span>
            Передавать параметры ссылки в кнопку
            <span className="block ds-caption">subid, click_id, utm… из адреса лендинга докидываются в ссылку оффера — для Keitaro, Binom и т. п.</span>
          </span>
        </label>
        <p className="mt-2 ds-caption">На клик кнопки шлём события: Meta — Lead, TikTok — ClickButton, GTM — cta_click.</p>
      </CollapsibleSection>

      <CollapsibleSection title="Блоки под механикой" hint="Бонусы, доверие, шаги, лента, отзывы, FAQ" defaultOpen={false}>
        <label className="mb-1.5 block ds-caption">Стиль блоков</label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {STYLE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => patch("look", { style: o.id })}
              aria-pressed={x.look.style === o.id}
              title={o.hint}
              className={`rounded-lg border px-2 py-2 text-sm transition ${x.look.style === o.id ? CHIP_ON : CHIP_OFF}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <Block label="Таймер сгорания бонуса" on={x.timer.on} onToggle={(on) => patch("timer", { on })}>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <input value={x.timer.text} maxLength={60} onChange={(e) => patch("timer", { text: e.target.value })} className={INPUT} />
            <input
              type="number"
              min={1}
              max={180}
              value={x.timer.minutes}
              onChange={(e) => patch("timer", { minutes: Math.max(1, Math.min(180, Number(e.target.value) || 15)) })}
              className={INPUT}
              aria-label="Минут"
            />
          </div>
        </Block>

        <Block label="Бонусы — карточки" on={x.bonuses.on} onToggle={(on) => patch("bonuses", { on })}>
          <input value={x.bonuses.title} maxLength={60} onChange={(e) => patch("bonuses", { title: e.target.value })} className={INPUT} />
          <div className="mt-2 flex flex-col gap-2">
            {x.bonuses.items.map((b, i) => (
              <div key={i} className="flex gap-2 rounded-lg border border-border p-2">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:10px_10px]">
                  {b.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.image} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <input
                    value={b.title}
                    maxLength={40}
                    onChange={(e) => patch("bonuses", { items: x.bonuses.items.map((it, j) => (j === i ? { ...it, title: e.target.value } : it)) })}
                    className={`${INPUT} h-9`}
                  />
                  <input
                    value={b.text}
                    maxLength={80}
                    onChange={(e) => patch("bonuses", { items: x.bonuses.items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)) })}
                    className={`${INPUT} h-9`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <UploadButton onFile={(f) => void uploadBonus(i, f)} />
                  {b.image ? (
                    <button type="button" onClick={() => setBonusImage(i, undefined)} aria-label="Убрать картинку" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <p className="mb-1.5 flex items-center gap-1.5 ds-caption">
              <Sparkles className="h-3.5 w-3.5 text-accent-green" /> Иллюстрации карточек от ИИ — по одной на карточку
            </p>
            <AssetRunPanel
              steps={assetRun.steps}
              running={assetRun.running}
              notEnough={assetRun.notEnough}
              credits={credits}
              onStart={() => {
                if (isGuest) return openGate();
                const s = steps();
                if (!s.length) return toast.error("Заполните заголовки карточек");
                void assetRun.start(s);
              }}
              onCancel={assetRun.cancel}
            />
          </div>
        </Block>

        <Block label="Доверие — цифры, лицензия, платёжки" on={x.trust.on} onToggle={(on) => patch("trust", { on })}>
          <div className="grid grid-cols-3 gap-2">
            <input value={x.trust.rating} maxLength={8} onChange={(e) => patch("trust", { rating: e.target.value })} className={INPUT} aria-label="Рейтинг" />
            <input value={x.trust.players} maxLength={16} onChange={(e) => patch("trust", { players: e.target.value })} className={INPUT} aria-label="Игроков" />
            <input value={x.trust.payout} maxLength={20} onChange={(e) => patch("trust", { payout: e.target.value })} className={INPUT} aria-label="Вывод" />
          </div>
          <input value={x.trust.license} maxLength={60} onChange={(e) => patch("trust", { license: e.target.value })} className={`${INPUT} mt-2`} placeholder="Лицензия" />
          <input value={x.trust.payments} maxLength={160} onChange={(e) => patch("trust", { payments: e.target.value })} className={`${INPUT} mt-2`} placeholder="Платёжки через запятую" />
        </Block>

        <Block label="Как забрать бонус — 3 шага" on={x.steps.on} onToggle={(on) => patch("steps", { on })}>
          <input value={x.steps.title} maxLength={60} onChange={(e) => patch("steps", { title: e.target.value })} className={INPUT} />
          {x.steps.items.map((t, i) => (
            <input
              key={i}
              value={t}
              maxLength={60}
              onChange={(e) => patch("steps", { items: x.steps.items.map((s, j) => (j === i ? e.target.value : s)) })}
              className={`${INPUT} mt-2`}
            />
          ))}
        </Block>

        <Block label="Лента выигрышей" on={x.winners.on} onToggle={(on) => patch("winners", { on })}>
          <label className="mb-1 block ds-caption">Валюта в ленте</label>
          <input value={x.winners.currency} maxLength={6} onChange={(e) => patch("winners", { currency: e.target.value })} className={`${INPUT} w-28`} />
        </Block>

        <Block label="Отзывы игроков" on={x.reviews.on} onToggle={(on) => patch("reviews", { on })}>
          <input value={x.reviews.title} maxLength={60} onChange={(e) => patch("reviews", { title: e.target.value })} className={INPUT} />
          {x.reviews.items.map((r, i) => (
            <div key={i} className="mt-2 grid grid-cols-2 gap-2">
              <input value={r.name} maxLength={24} onChange={(e) => patch("reviews", { items: x.reviews.items.map((it, j) => (j === i ? { ...it, name: e.target.value } : it)) })} className={INPUT} aria-label="Имя" />
              <input value={r.city} maxLength={24} onChange={(e) => patch("reviews", { items: x.reviews.items.map((it, j) => (j === i ? { ...it, city: e.target.value } : it)) })} className={INPUT} aria-label="Город" />
              <textarea rows={2} maxLength={160} value={r.text} onChange={(e) => patch("reviews", { items: x.reviews.items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)) })} className={`${AREA} col-span-2`} />
            </div>
          ))}
        </Block>

        <Block label="Частые вопросы" on={x.faq.on} onToggle={(on) => patch("faq", { on })}>
          <input value={x.faq.title} maxLength={60} onChange={(e) => patch("faq", { title: e.target.value })} className={INPUT} />
          {x.faq.items.map((f, i) => (
            <div key={i} className="mt-2 flex flex-col gap-1.5">
              <input value={f.q} maxLength={80} onChange={(e) => patch("faq", { items: x.faq.items.map((it, j) => (j === i ? { ...it, q: e.target.value } : it)) })} className={INPUT} />
              <textarea rows={2} maxLength={240} value={f.a} onChange={(e) => patch("faq", { items: x.faq.items.map((it, j) => (j === i ? { ...it, a: e.target.value } : it)) })} className={AREA} />
            </div>
          ))}
        </Block>
      </CollapsibleSection>
    </>
  );
}

function Block({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="mb-2 rounded-lg border border-border p-2.5">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-[var(--accent-green)]" />
        {label}
      </label>
      {on ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function UploadButton({ onFile }: { onFile: (f: File | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} aria-label="Загрузить картинку" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5">
        <Upload className="h-4 w-4" />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Живое превью блоков под первым экраном (полная страница — «На весь экран»). */
export function LandingExtrasPreview({ extras, accent, dark, kind }: { extras: LandingExtras; accent: string; dark: boolean; kind: LandingKind }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setHtml(buildExtrasPreviewHtml(extras, accent, dark, kind)), 300);
    return () => window.clearTimeout(id);
  }, [extras, accent, dark, kind]);
  return (
    <div className="mt-4">
      <p className="mb-2 ds-caption">Под первым экраном — блоки и подвал. Вся страница целиком — в «На весь экран».</p>
      <iframe
        srcDoc={html}
        title="Блоки под механикой"
        sandbox="allow-scripts"
        className="block h-[460px] w-full rounded-2xl border border-border bg-black"
      />
    </div>
  );
}
