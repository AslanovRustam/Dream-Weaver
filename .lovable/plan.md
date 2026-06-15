## Что меняем

### 1. Настройка качества (Low / Medium / High)

- В `ImageGenApp.tsx` добавляю сегмент-контрол `Качество: Low · Medium · High` (рядом с моделью и соотношением сторон). Значение хранится в стейте и в localStorage (`image_quality`), дефолт — `medium`.
- Передаём `quality` в `/api/generate-image` через payload.
- В `generate-image.ts`:
  - Для **Реализма (gpt-image-2)** прокидываем `quality: <low|medium|high>` и в `/v1/images/generations`, и в `/v1/images/edits`.
  - Для **Артистизма (Nano Banana 2)** селектор показывается, но в UI помечается как «не влияет на модель» (tooltip/подпись «доступно только для Реализма»). На бэке для Nano параметр игнорируется.

### 2. Учёт токенов и стоимости

- Возвращаем из `/api/generate-image` поле `usage`:
  ```ts
  usage: {
    provider: "openai" | "lovable",
    model: string,
    input_text_tokens?: number,
    input_image_tokens?: number,
    output_image_tokens?: number,
    total_tokens?: number,
    cost_usd?: number,
    quality?: "low"|"medium"|"high",
  }
  ```
- OpenAI `images/generations` и `images/edits` возвращают `usage` с `input_tokens`, `input_tokens_details.{text_tokens,image_tokens}`, `output_tokens`, `total_tokens` — парсим как есть.
- Lovable Gateway возвращает стандартный OpenAI-совместимый `usage` (prompt_tokens / completion_tokens) — парсим и помечаем `cost_usd: null` (биллинг по запросам, не по токенам).
- Стоимость для gpt-image-2 считаем по справочнику OpenAI (зашиваю в константы `PRICING` в `generate-image.ts`, чтобы легко править):
  ```
  gpt-image-2: input_text $5/M, input_image $10/M, output_image $40/M
  ```
  Формула: `cost = input_text*5 + input_image*10 + output_image*40` / 1_000_000.

### 3. UI под картинкой

- Под сгенерированным баннером в `ImageGenApp.tsx` добавляю компактную строку:
  ```
  Качество: Medium · Токены: 1 234 (in 320 + img 240 + out 674) · ≈ $0.0421
  ```
- Если `cost_usd` нет (Nano) — показываем только токены и пометку «Lovable AI · биллинг по запросам».

### Затрагиваемые файлы

- `src/routes/api/generate-image.ts` — quality, парсинг usage, расчёт cost, возврат `usage`.
- `src/lib/imageGen.ts` — расширяю тип ответа и payload (`quality`).
- `src/components/ImageGenApp.tsx` — селектор качества + строка usage под картинкой.

### Что не меняем

- Промпты, шаблоны, логика рефов, размер/aspect — без изменений.
- Артистизм продолжает работать через Lovable Gateway как раньше.
