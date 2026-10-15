// Каждый шаблон письма → готовый HTML → свод правил вёрстки (email-rules-check.mjs).
//
//   npx tsx scripts/email-templates-check.mts
//
// Бренд и ссылки — тестовые; картинки героя нет, как у нового черновика. Значки
// сторов при выгрузке заливаются на хостинг (hostEmailImages) — подставляем ссылки.
// Ловит шаблон, который ломает правила ещё до правок пользователя.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildEmailHtml } from "../src/lib/emailExport";
import { applyTemplate, EMAIL_TEMPLATES } from "../src/lib/emailTemplates";
import { newDraft } from "../src/lib/mailing";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gengo-email-"));
let failed = 0;
for (const t of EMAIL_TEMPLATES) {
  const draft = applyTemplate({ ...newDraft(), brand: "Brand", ctaUrl: "https://example.com/go", unsubscribeUrl: "https://example.com/unsub" }, t);
  const file = path.join(dir, `${t.id}.html`);
  const hosted = { appStore: "https://example.com/app-store.png", googlePlay: "https://example.com/google-play.png" };
  fs.writeFileSync(file, buildEmailHtml(draft, hosted));
  const r = spawnSync(process.execPath, ["scripts/email-rules-check.mjs", file], { encoding: "utf8" });
  if (r.status === 0) console.log(`✓ ${t.id}`);
  else {
    failed++;
    console.log(`✗ ${t.id}\n${(r.stdout || "") + (r.stderr || "")}`);
  }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} из ${EMAIL_TEMPLATES.length} шаблонов нарушают правила` : `✓ все ${EMAIL_TEMPLATES.length} шаблонов писем проходят правила`);
process.exit(failed ? 1 : 0);
