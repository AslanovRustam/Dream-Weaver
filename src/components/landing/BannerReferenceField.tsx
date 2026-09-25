"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { compressImage } from "@/lib/imageCompress";

/**
 * Свой баннер как основа лендинга.
 *
 * До этого лендинг умел опираться только на баннер, сделанный у нас: переход
 * «сделать лендинг из баннера» приносил его вместе с разбором. Но у клиента
 * обычно уже есть согласованный креатив, и начинать с него — нормальный путь,
 * а не исключение.
 *
 * Загруженный баннер делает две вещи: его разбирают (тексты, цвет, промпты) и
 * он же идёт стилевым референсом в генерацию фона и персонажа — то есть
 * лендинг рисуется от него, а не «где-то рядом».
 *
 * Жмём перед отправкой: баннер клиента может быть многомегабайтным
 * PNG-исходником, а на вход генератору нужна картинка, а не типография.
 */
const MAX_WIDTH = 1536;
const MAX_BYTES = 1.5 * 1024 * 1024;

export function BannerReferenceField({
  value,
  analyzing,
  onPick,
  onClear,
}: {
  value: string;
  /** Идёт разбор — кнопка занята, и об этом надо сказать. */
  analyzing: boolean;
  onPick: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const onFile = (file: File | null) => {
    if (!file) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      void compressImage(String(reader.result), {
        maxWidth: MAX_WIDTH,
        maxBytes: MAX_BYTES,
        background: "#000000",
      })
        .then((out) => onPick(out.dataUrl))
        .catch(() => onPick(String(reader.result)))
        .finally(() => setBusy(false));
    };
    reader.onerror = () => setBusy(false);
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <label className="mb-2 block ds-h4">Свой баннер</label>

      {value ? (
        <div className="flex items-center gap-2">
          <img
            src={value}
            alt=""
            className="h-12 w-20 rounded-md border border-border object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground transition hover:text-foreground"
          >
            Убрать
          </button>
          {analyzing ? (
            <span className="flex items-center gap-1.5 ds-caption">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Разбираем…
            </span>
          ) : null}
        </div>
      ) : (
        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-elevated px-3 text-sm text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Готовим картинку…" : "Загрузить баннер"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}

      <p className="mt-1.5 ds-caption">
        Разберём тексты, цвет и сюжет, заполним поля и будем рисовать фон с персонажем от этого
        баннера. Генерацию запустите кнопкой ниже — кредиты списываются только за неё.
      </p>
    </div>
  );
}
