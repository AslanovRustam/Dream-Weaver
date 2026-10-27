// Тексты блоков лендинга от ИИ: что просить по каждому блоку и как проверять
// ответ. Общий код /api/landing-blocks («Применить тему» в редакторах) и
// /api/campaign-copy (раскладка темы по всей кампании).

/** Что вернуть по каждому блоку — для промпта. */
export const BLOCK_SHAPES: Record<string, string> = {
  timer: '{"text": "short urgency line before a countdown, <=40 chars"}',
  bonuses: '{"title": "<=40", "items": [4 × {"title": "bonus name with numbers, <=28", "text": "<=60"}]}',
  jackpot: '{"title": "<=40, a growing jackpot / prize pool headline"}',
  express:
    '{"title": "<=30", "items": [3 × {"match": "Team A — Team B", "pick": "outcome, <=20", "odd": "decimal like 1.85"}]} — an accumulator: 3 DIFFERENT matches (never the same match twice); if the theme names a match, it goes first with its real teams, the other two are other plausible matches of the same league or day',
  promo: '{"title": "<=32", "code": "LATIN UPPERCASE 6-12 chars, themed", "text": "what the code gives, <=80"}',
  games: '{"title": "<=32", "items": [8 × {"title": "slot or match name, <=22", "sub": "RTP 96.5% or kick-off time, <=16"}]}',
  features: '{"title": "<=36", "items": [4 × {"title": "<=24", "text": "<=60"}]}',
  steps: '{"title": "<=36", "items": [3 short steps, each <=40]}',
  tournament: '{"title": "<=36", "prize": "prize pool with currency, <=16", "text": "<=90"}',
  vip: '{"title": "<=24", "items": [4 × {"name": "tier name, <=14", "perk": "<=56"}]}',
  reviews: '{"title": "<=32", "items": [3 × {"name": "first name", "city": "city", "text": "<=110"}]}',
  app: '{"title": "<=32", "text": "<=90"}',
  faq: '{"title": "<=32", "items": [3 × {"q": "<=70", "a": "<=180"}]}',
  final: '{"title": "<=36", "text": "<=100", "button": "<=22"}',
};

export type Obj = Record<string, unknown>;
export const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
export const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
export const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Привести ответ модели к ожидаемым полям; пустое — выбросить (клиент оставит своё). */
export function cleanBlockCopy(id: string, raw: Obj): Obj | null {
  const o: Obj = {};
  const put = (k: string, v: unknown) => {
    if (typeof v === "string" ? v : Array.isArray(v) ? v.length : v) o[k] = v;
  };
  const items = <T,>(max: number, f: (it: Obj) => T | null) => arr(raw.items, max).map((it) => f(obj(it))).filter((x): x is T => !!x);
  if (id !== "timer") put("title", s(raw.title, 48));
  switch (id) {
    case "timer": put("text", s(raw.text, 48)); break;
    case "bonuses": put("items", items(4, (it) => (s(it.title, 32) ? { title: s(it.title, 32), text: s(it.text, 70) } : null))); break;
    case "express":
      put("items", items(5, (it) => (s(it.match, 48) ? { match: s(it.match, 48), pick: s(it.pick, 28), odd: /^\d{1,2}([.,]\d{1,2})?$/.test(s(it.odd, 6)) ? s(it.odd, 6).replace(",", ".") : "1.80" } : null)));
      break;
    case "promo": put("code", s(raw.code, 16).toUpperCase().replace(/[^A-Z0-9]/g, "")); put("text", s(raw.text, 100)); break;
    case "games": put("items", items(8, (it) => (s(it.title, 24) ? { title: s(it.title, 24), sub: s(it.sub, 18) } : null))); break;
    case "features": put("items", items(4, (it) => (s(it.title, 28) ? { title: s(it.title, 28), text: s(it.text, 70) } : null))); break;
    case "steps": put("items", arr(raw.items, 3).map((t) => s(t, 48)).filter(Boolean)); break;
    case "tournament": put("prize", s(raw.prize, 20)); put("text", s(raw.text, 110)); break;
    case "vip": put("items", items(4, (it) => (s(it.name, 16) ? { name: s(it.name, 16), perk: s(it.perk, 64) } : null))); break;
    case "reviews": put("items", items(3, (it) => (s(it.text, 140) ? { name: s(it.name, 20), city: s(it.city, 20), text: s(it.text, 140) } : null))); break;
    case "app": put("text", s(raw.text, 110)); break;
    case "faq": put("items", items(3, (it) => (s(it.q, 80) ? { q: s(it.q, 80), a: s(it.a, 220) } : null))); break;
    case "final": put("text", s(raw.text, 120)); put("button", s(raw.button, 24)); break;
  }
  return Object.keys(o).length ? o : null;
}

