// Сравнение моделей движка ТЗ на одних и тех же ТЗ: понимание ТЗ и описание баннера.
//
// Запуск (из корня проекта):
//   npx jiti scripts/tz-compare/compare.mts [--models gpt-5.5,claude-opus-5-5] [--brief gpt-5.4-mini,claude-haiku-5-5] [--only 01,05]
// ТЗ — scripts/tz-compare/samples/*.txt. Каждое ТЗ собирается один раз (ссылки,
// скриншоты), дальше одинаковый пакет идёт в каждую модель. Результат:
//   scripts/tz-compare/out/<время>/report.md + raw.json
// Ключи — из .env.local (OPENAI_API_KEY, ANTHROPIC_API_KEY). Запуск стоит денег.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const { createJiti } = await import("jiti");
const J = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src") } });
const { ingestTz } = (await J.import(path.join(process.cwd(), "src/lib/tz/ingest.ts"))) as typeof import("../../src/lib/tz/ingest");
const { understandTz } = (await J.import(path.join(process.cwd(), "src/lib/tz/understand.ts"))) as typeof import("../../src/lib/tz/understand");
const { llmJson } = (await J.import(path.join(process.cwd(), "src/lib/llm.ts"))) as typeof import("../../src/lib/llm");

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const MODELS = arg("models", "gpt-5.5,claude-opus-5-5").split(",");
const BRIEF_MODELS = arg("brief", "gpt-5.4-mini,claude-haiku-5-5").split(",").filter(Boolean);
const ONLY = arg("only", "").split(",").filter(Boolean);

// Каталог шаблонов — как его шлёт клиент (id, название, описание), без спорт-шаблона.
const src = readFileSync("src/components/PresetSidebar.tsx", "utf8") + readFileSync("src/lib/presetsBatch3.ts", "utf8");
const templates = [...src.matchAll(/id: "(preset\w+)",[\s\S]{0,200}?name: "([^"]+)",\s*description: "([^"]+)"/g)]
  .map((m) => ({ id: m[1], name: m[2], description: m[3] }))
  .filter((t) => t.id !== "preset4");
const templateText = new Map(
  [...src.matchAll(/id: "(preset\w+)",[\s\S]*?template: `([\s\S]*?)`,\n/g)].map((m) => [m[1], m[2]] as const),
);

// Арт-директор баннера (тот же SYSTEM, что в lib/bannerTz) — модель передаём явно.
const bannerTzSrc = readFileSync("src/lib/bannerTz.ts", "utf8");
const BRIEF_SYSTEM = (await J.import(path.join(process.cwd(), "src/lib/bannerTz.ts"))) as { TZ_BRIEF_MODEL: string };
void BRIEF_SYSTEM;
const systemMatch = /const SYSTEM = \[([\s\S]*?)\]\.join\("\\n"\);/.exec(bannerTzSrc);
const OFFER_RULE = ((await J.import(path.join(process.cwd(), "src/lib/offerText.ts"))) as { OFFER_RULE: string }).OFFER_RULE;
// eslint-disable-next-line no-new-func
const briefSystem: string = systemMatch ? (new Function("OFFER_RULE", `return [${systemMatch[1]}].join("\\n");`)(OFFER_RULE) as string) : "";

const dir = "scripts/tz-compare/samples";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".txt"))
  .filter((f) => !ONLY.length || ONLY.some((o) => f.startsWith(o)));
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = `scripts/tz-compare/out/${stamp}`;
mkdirSync(out, { recursive: true });

type Row = Record<string, unknown>;
const raw: Row[] = [];
const md: string[] = [`# Сравнение моделей движка ТЗ — ${new Date().toLocaleString("ru-RU")}`, "", `Понимание ТЗ: ${MODELS.join(" vs ")}. Описание баннера: ${BRIEF_MODELS.join(" vs ")}.`, ""];
const totals: Record<string, { ms: number; cost: number; n: number; err: number }> = {};
const tot = (m: string) => (totals[m] ??= { ms: 0, cost: 0, n: 0, err: 0 });

for (const f of files) {
  const text = readFileSync(path.join(dir, f), "utf8");
  console.log(`\n=== ${f}`);
  const bundle = await ingestTz({ text }, (m) => console.log("   >", m));
  md.push(`## ${f}`, "", "```", text.trim(), "```", "");
  const jobs: Record<string, Awaited<ReturnType<typeof understandTz>>["job"]> = {};
  for (const model of MODELS) {
    try {
      const r = await understandTz(bundle, templates, "", "banner", model);
      const u = (r.usage as { usage: { cost: number; prompt_tokens: number; completion_tokens: number; cache_read_tokens: number } }).usage;
      jobs[model] = r.job;
      tot(model).ms += r.ms;
      tot(model).cost += u.cost;
      tot(model).n++;
      console.log(`   ${model}: ${r.ms} ms, $${u.cost.toFixed(4)}, in ${u.prompt_tokens} (cache ${u.cache_read_tokens}), out ${u.completion_tokens}`);
      raw.push({ file: f, step: "understand", model, ms: r.ms, usage: u, job: r.job });
      const j = r.job;
      md.push(
        `### ${model} — ${(r.ms / 1000).toFixed(1)} с, $${u.cost.toFixed(4)}`,
        "",
        `- **Суть:** ${j.summary}`,
        `- **Оффер:** ${j.offer || "—"} · **язык:** ${j.language} · **гео:** ${j.geo || "—"} · **бренд:** ${j.brand.name || "—"}`,
        `- **Креативы:** ${j.banners.map((b) => `${b.name} ${b.aspect} — «${b.headline}» / «${b.cta}» → ${templates.find((t) => t.id === b.presetId)?.name ?? b.presetId}${b.altPresetId ? ` (Б: ${templates.find((t) => t.id === b.altPresetId)?.name})` : ""}`).join("; ")}`,
        `- **Размеры:** ${j.sizes.map((s) => `${s.w}×${s.h}`).join(", ") || j.sizeGroups.join(", ") || "—"}`,
        `- **Требования (${j.requirements.length}):** ${j.requirements.map((q) => q.text + (q.exact ? ` [«${q.exact}»]` : "")).join(" · ")}`,
        `- **Вопросы:** ${j.questions.map((q) => `${q.text} (${q.options.join(" / ")})`).join(" · ") || "—"}`,
        `- **Допущения:** ${j.assumptions.join(" · ") || "—"}`,
        `- **Нельзя:** ${j.cannot.join(" · ") || "—"}`,
        "",
      );
    } catch (e) {
      tot(model).err++;
      console.log(`   ${model}: ОШИБКА ${(e as Error).message}`);
      md.push(`### ${model} — ошибка: ${(e as Error).message}`, "");
      raw.push({ file: f, step: "understand", model, error: (e as Error).message });
    }
  }
  // Описание баннера: одно и то же задание (от первой модели, что справилась) — разным моделям.
  const job = Object.values(jobs)[0];
  const b = job?.banners[0];
  if (job && b && briefSystem) {
    const tplText = templateText.get(b.presetId) ?? "";
    const tpl = templates.find((t) => t.id === b.presetId);
    const brief = `Задача: ${job.summary}\nОффер (дословно): ${job.offer}\nЗаголовок: «${b.headline}»; кнопка: «${b.cta}». Язык: ${job.language}.\nВизуал: ${b.visual}\nАрт-дирекшн: ${job.style.direction}; палитра: ${job.style.palette.join(", ")}.`;
    for (const model of BRIEF_MODELS) {
      try {
        const r = await llmJson({
          model,
          system: briefSystem,
          parts: [{ type: "text", text: `TEMPLATE «${tpl?.name}» — ${tpl?.description}\nTemplate prompt (how it renders):\n${tplText.slice(0, 3000)}\n\nBRIEF (ТЗ):\n"""${brief}"""` }],
          effort: "low",
          maxTokens: 8000,
          timeoutMs: 60_000,
        });
        tot(`brief:${model}`).ms += r.ms;
        tot(`brief:${model}`).cost += r.usage.cost;
        tot(`brief:${model}`).n++;
        console.log(`   brief ${model}: ${r.ms} ms, $${r.usage.cost.toFixed(5)}`);
        raw.push({ file: f, step: "brief", model, ms: r.ms, usage: r.usage, json: r.json });
        md.push(`### Описание баннера — ${model} — ${(r.ms / 1000).toFixed(1)} с, $${r.usage.cost.toFixed(5)}`, "", `> ${String(r.json.prompt ?? "").replace(/\n/g, " ")}`, "", `Тексты: «${r.json.bannerText}» / «${r.json.buttonText}»`, "");
      } catch (e) {
        tot(`brief:${model}`).err++;
        md.push(`### Описание баннера — ${model} — ошибка: ${(e as Error).message}`, "");
      }
    }
  }
}

md.push("## Итого", "", "| Модель | ТЗ | Ошибок | Среднее время | Средняя цена | Всего $ |", "|---|---|---|---|---|---|");
for (const [m, t] of Object.entries(totals))
  md.push(`| ${m} | ${t.n} | ${t.err} | ${t.n ? (t.ms / t.n / 1000).toFixed(1) : "—"} с | $${t.n ? (t.cost / t.n).toFixed(4) : "—"} | $${t.cost.toFixed(4)} |`);
writeFileSync(`${out}/report.md`, md.join("\n"));
writeFileSync(`${out}/raw.json`, JSON.stringify(raw, null, 1));
console.log(`\nОтчёт: ${out}/report.md`);
